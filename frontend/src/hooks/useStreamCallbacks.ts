import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { useReviewStore } from '@/store';
import { appendEventToLog } from '@/utils/stream';
import { playNotificationSound } from '@/utils/audio';
import { queryKeys, useSettingsQuery } from '@/hooks/queries';
import type { AssistantStreamEvent, Chat, Message, PermissionRequest, StreamState } from '@/types';
import { useMessageCache } from '@/hooks/useMessageCache';
import { streamService } from '@/services/streamService';
import type { StreamOptions } from '@/services/streamService';

interface UseStreamCallbacksParams {
  chatId: string | undefined;
  currentChat: Chat | undefined;
  queryClient: QueryClient;
  refetchFilesMetadata: () => Promise<unknown>;
  refetchContextUsage: () => Promise<unknown> | void;
  onPermissionRequest?: (request: PermissionRequest) => void;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setStreamState: Dispatch<SetStateAction<StreamState>>;
  setCurrentMessageId: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<Error | null>>;
  pendingStopRef: React.MutableRefObject<Set<string>>;
}

interface UseStreamCallbacksResult {
  onChunk: (event: AssistantStreamEvent, messageId: string) => void;
  onComplete: () => void;
  onError: (error: Error, messageId?: string) => void;
  startStream: (request: StreamOptions['request']) => Promise<string>;
  replayStream: (messageId: string) => Promise<string>;
  stopStream: (messageId: string) => Promise<void>;
  updateMessageInCache: ReturnType<typeof useMessageCache>['updateMessageInCache'];
  addMessageToCache: ReturnType<typeof useMessageCache>['addMessageToCache'];
  removeMessagesFromCache: ReturnType<typeof useMessageCache>['removeMessagesFromCache'];
  getReviewsForChat: ReturnType<typeof useReviewStore.getState>['getReviewsForChat'];
  clearReviewsForChat: ReturnType<typeof useReviewStore.getState>['clearReviewsForChat'];
  setPendingUserMessageId: (id: string | null) => void;
}

export function useStreamCallbacks({
  chatId,
  currentChat,
  queryClient,
  refetchFilesMetadata,
  refetchContextUsage,
  onPermissionRequest,
  setMessages,
  setStreamState,
  setCurrentMessageId,
  setError,
  pendingStopRef,
}: UseStreamCallbacksParams): UseStreamCallbacksResult {
  const optionsRef = useRef<{
    chatId: string;
    onChunk?: (event: AssistantStreamEvent, messageId: string) => void;
    onComplete?: (messageId?: string) => void;
    onError?: (error: Error, messageId?: string) => void;
  } | null>(null);

  const pendingUserMessageIdRef = useRef<string | null>(null);

  const { updateMessageInCache, addMessageToCache, removeMessagesFromCache } = useMessageCache({
    chatId,
    queryClient,
  });
  const getReviewsForChat = useReviewStore((state) => state.getReviewsForChat);
  const clearReviewsForChat = useReviewStore((state) => state.clearReviewsForChat);
  const { data: settings } = useSettingsQuery();

  const setPendingUserMessageId = useCallback((id: string | null) => {
    pendingUserMessageIdRef.current = id;
  }, []);

  const onChunk = useCallback(
    (event: AssistantStreamEvent, messageId: string) => {
      if (pendingStopRef.current.has(messageId)) {
        return;
      }

      if (event.type === 'permission_request' && onPermissionRequest) {
        onPermissionRequest({
          request_id: event.request_id,
          tool_name: event.tool_name,
          tool_input: event.tool_input,
        });
        return;
      }

      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === messageId ? { ...msg, content: appendEventToLog(msg.content, event) } : msg,
        ),
      );

      updateMessageInCache(messageId, (cachedMsg) => ({
        ...cachedMsg,
        content: appendEventToLog(cachedMsg.content, event),
      }));
    },
    [updateMessageInCache, onPermissionRequest, setMessages, pendingStopRef],
  );

  const onComplete = useCallback(() => {
    setStreamState('idle');
    setCurrentMessageId(null);

    if (settings?.notification_sound_enabled ?? true) {
      playNotificationSound();
    }

    if (chatId && currentChat?.sandbox_id) {
      refetchFilesMetadata().catch(() => {});
      queryClient.removeQueries({
        queryKey: ['sandbox', currentChat.sandbox_id, 'file-content'],
      });
    }

    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: [queryKeys.auth.usage] });
    }, 2000);

    if (chatId) {
      const initialTokens = currentChat?.context_token_usage ?? 0;
      const startTime = Date.now();
      let lastTokens: number | undefined;
      let stableCount = 0;

      const scheduleNext = (attempt: number) => {
        const delay = Math.min(1000 * Math.pow(2, attempt), 4000);
        if (Date.now() - startTime + delay < 15000) {
          setTimeout(() => poll(attempt + 1), delay);
        }
      };

      const poll = (attempt: number) => {
        if (Date.now() - startTime > 15000) return;

        Promise.resolve(refetchContextUsage())
          .then((result) => {
            const tokens = (result as { data?: { tokens_used?: number } })?.data?.tokens_used;

            if (tokens !== undefined && tokens !== initialTokens) {
              stableCount = tokens === lastTokens ? stableCount + 1 : 1;
              if (stableCount >= 2) return;
            }
            lastTokens = tokens;
            scheduleNext(attempt);
          })
          .catch(() => scheduleNext(attempt));
      };

      setTimeout(() => poll(0), 1000);
    }
  }, [
    chatId,
    currentChat?.sandbox_id,
    currentChat?.context_token_usage,
    queryClient,
    refetchContextUsage,
    refetchFilesMetadata,
    setStreamState,
    setCurrentMessageId,
    settings?.notification_sound_enabled,
  ]);

  const onError = useCallback(
    (streamError: Error, assistantMessageId?: string) => {
      setError(streamError);
      setStreamState('error');
      setCurrentMessageId(null);

      const userMessageId = pendingUserMessageIdRef.current;
      const messageIdsToRemove: string[] = [];

      if (userMessageId) {
        messageIdsToRemove.push(userMessageId);
      }
      if (assistantMessageId) {
        messageIdsToRemove.push(assistantMessageId);
      }

      if (messageIdsToRemove.length > 0) {
        const idsToRemove = new Set(messageIdsToRemove);
        setMessages((prev) => prev.filter((msg) => !idsToRemove.has(msg.id)));
        removeMessagesFromCache(messageIdsToRemove);
      }

      pendingUserMessageIdRef.current = null;
    },
    [setError, setStreamState, setCurrentMessageId, setMessages, removeMessagesFromCache],
  );

  useEffect(() => {
    optionsRef.current = chatId ? { chatId, onChunk, onComplete, onError } : null;
  }, [chatId, onChunk, onComplete, onError]);

  const startStream = useCallback(async (request: StreamOptions['request']): Promise<string> => {
    const currentOptions = optionsRef.current;
    if (!currentOptions) {
      throw new Error('Stream options not available');
    }

    const streamOptions: StreamOptions = {
      chatId: currentOptions.chatId,
      request,
      onChunk: currentOptions.onChunk,
      onComplete: currentOptions.onComplete,
      onError: currentOptions.onError,
    };

    return streamService.startStream(streamOptions);
  }, []);

  const replayStream = useCallback(async (messageId: string): Promise<string> => {
    const currentOptions = optionsRef.current;
    if (!currentOptions) {
      throw new Error('Stream options not available');
    }

    return streamService.replayStream({
      chatId: currentOptions.chatId,
      messageId,
      onChunk: currentOptions.onChunk,
      onComplete: currentOptions.onComplete,
      onError: currentOptions.onError,
    });
  }, []);

  const stopStream = useCallback(
    async (messageId: string) => {
      if (!chatId) return;
      await streamService.stopStreamByMessage(chatId, messageId);
    },
    [chatId],
  );

  return {
    onChunk,
    onComplete,
    onError,
    startStream,
    replayStream,
    stopStream,
    updateMessageInCache,
    addMessageToCache,
    removeMessagesFromCache,
    getReviewsForChat,
    clearReviewsForChat,
    setPendingUserMessageId,
  };
}
