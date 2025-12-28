import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { logger } from '@/utils/logger';
import { chatService } from '@/services/chatService';
import type { Message, StreamState } from '@/types';

interface UseStreamReconnectParams {
  chatId: string | undefined;
  fetchedMessages: Message[];
  hasFetchedMessages: boolean;
  isInitialLoading: boolean;
  streamState: StreamState;
  currentMessageId: string | null;
  wasAborted: boolean;
  selectedModelId: string | null | undefined;
  setStreamState: Dispatch<SetStateAction<StreamState>>;
  setCurrentMessageId: Dispatch<SetStateAction<string | null>>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  addMessageToCache: (message: Message) => void;
  updateMessageInCache: (messageId: string, updater: (msg: Message) => Message) => void;
  replayStream: (messageId: string) => Promise<string>;
}

// Handles reconnecting to active streams when returning to a chat.
// Checks if server has an active task and replays the stream from where it left off.
export function useStreamReconnect({
  chatId,
  fetchedMessages,
  hasFetchedMessages,
  isInitialLoading,
  streamState,
  currentMessageId,
  wasAborted,
  selectedModelId,
  setStreamState,
  setCurrentMessageId,
  setMessages,
  addMessageToCache,
  updateMessageInCache,
  replayStream,
}: UseStreamReconnectParams): void {
  useEffect(() => {
    if (!chatId || isInitialLoading || !hasFetchedMessages) return;

    const checkActiveTask = async () => {
      try {
        const status = await chatService.checkChatStatus(chatId);
        if (status?.has_active_task && streamState === 'idle' && !currentMessageId && !wasAborted) {
          let targetMessageId = status.message_id;

          if (!targetMessageId) {
            const latestAssistantMessage = [...fetchedMessages]
              .reverse()
              .find((msg) => msg.role === 'assistant');
            targetMessageId = latestAssistantMessage?.id;
          }

          if (targetMessageId) {
            setStreamState('streaming');
            setCurrentMessageId(targetMessageId);

            const messageExists = fetchedMessages.some((msg) => msg.id === targetMessageId);
            const existingMessage = fetchedMessages.find((msg) => msg.id === targetMessageId);
            const previousContent = existingMessage?.content ?? JSON.stringify([]);

            if (!messageExists) {
              const placeholderMessage: Message = {
                id: targetMessageId,
                role: 'assistant',
                content: JSON.stringify([]),
                created_at: new Date().toISOString(),
                model_id: selectedModelId || '',
                is_bot: true,
              };
              addMessageToCache(placeholderMessage);
              setMessages((prev) => {
                if (prev.some((m) => m.id === placeholderMessage.id)) return prev;
                return [...prev, placeholderMessage];
              });
            }

            try {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === targetMessageId ? { ...msg, content: JSON.stringify([]) } : msg,
                ),
              );
              updateMessageInCache(targetMessageId, (msg) => ({
                ...msg,
                content: JSON.stringify([]),
              }));
              await replayStream(targetMessageId);
            } catch (replayError) {
              logger.error('Stream reconnect failed', 'useStreamReconnect', replayError);
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === targetMessageId ? { ...msg, content: previousContent } : msg,
                ),
              );
              updateMessageInCache(targetMessageId, (msg) => ({
                ...msg,
                content: previousContent,
              }));
              setStreamState('idle');
              setCurrentMessageId(null);
            }
          }
        }
      } catch (checkError) {
        logger.error('Active task check failed', 'useStreamReconnect', checkError);
      }
    };

    const timeoutId = setTimeout(checkActiveTask, 100);
    return () => {
      clearTimeout(timeoutId);
    };
  }, [
    chatId,
    currentMessageId,
    fetchedMessages,
    hasFetchedMessages,
    isInitialLoading,
    replayStream,
    streamState,
    updateMessageInCache,
    wasAborted,
    addMessageToCache,
    selectedModelId,
    setStreamState,
    setCurrentMessageId,
    setMessages,
  ]);
}
