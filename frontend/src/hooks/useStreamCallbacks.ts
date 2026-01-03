import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { useReviewStore } from '@/store';
import { appendEventToLog } from '@/utils/stream';
import { playNotificationSound } from '@/utils/audio';
import { queryKeys, useSettingsQuery } from '@/hooks/queries';
import type {
  AssistantStreamEvent,
  Chat,
  ContextUsage,
  Message,
  PermissionRequest,
  StreamState,
  QueueProcessingData,
} from '@/types';
import { useMessageCache } from '@/hooks/useMessageCache';
import { streamService } from '@/services/streamService';
import type { StreamOptions } from '@/services/streamService';

interface UseStreamCallbacksParams {
  chatId: string | undefined;
  currentChat: Chat | undefined;
  queryClient: QueryClient;
  refetchFilesMetadata: () => Promise<unknown>;
  onContextUsageUpdate?: (data: ContextUsage, chatId?: string) => void;
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
  onQueueProcess: (data: QueueProcessingData) => void;
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
  onContextUsageUpdate,
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
    onQueueProcess?: (data: QueueProcessingData) => void;
  } | null>(null);

  const pendingUserMessageIdRef = useRef<string | null>(null);
  const timerIdsRef = useRef<NodeJS.Timeout[]>([]);

  useEffect(() => {
    return () => {
      timerIdsRef.current.forEach(clearTimeout);
    };
  }, []);

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

      if (event.type === 'system' && event.data?.context_usage && onContextUsageUpdate) {
        const eventChatId =
          typeof event.data.chat_id === 'string' ? (event.data.chat_id as string) : undefined;
        onContextUsageUpdate(event.data.context_usage as ContextUsage, eventChatId);
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
    [updateMessageInCache, onPermissionRequest, onContextUsageUpdate, setMessages, pendingStopRef],
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

    timerIdsRef.current.forEach(clearTimeout);
    timerIdsRef.current = [];

    timerIdsRef.current.push(
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: [queryKeys.auth.usage] });
      }, 2000),
    );

    if (chatId) {
      timerIdsRef.current.push(
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: queryKeys.contextUsage(chatId) });
        }, 6000),
      );
    }
  }, [
    chatId,
    currentChat?.sandbox_id,
    queryClient,
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

  const onQueueProcess = useCallback(
    (data: QueueProcessingData) => {
      if (!chatId) return;

      const userMessage: Message = {
        id: data.userMessageId,
        chat_id: chatId,
        role: 'user',
        content: data.content,
        created_at: new Date().toISOString(),
        attachments: data.attachments || [],
        is_bot: false,
      };

      const assistantMessage: Message = {
        id: data.assistantMessageId,
        chat_id: chatId,
        role: 'assistant',
        content: '',
        created_at: new Date().toISOString(),
        model_id: data.modelId,
        attachments: [],
        is_bot: true,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      addMessageToCache(userMessage);
      addMessageToCache(assistantMessage);
      setCurrentMessageId(data.assistantMessageId);
    },
    [chatId, setMessages, addMessageToCache, setCurrentMessageId],
  );

  useEffect(() => {
    optionsRef.current = chatId ? { chatId, onChunk, onComplete, onError, onQueueProcess } : null;
  }, [chatId, onChunk, onComplete, onError, onQueueProcess]);

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
      onQueueProcess: currentOptions.onQueueProcess,
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
      onQueueProcess: currentOptions.onQueueProcess,
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
    onQueueProcess,
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
