import { create } from 'zustand';
import type { LocalQueuedMessage } from '@/types';
import { queueService } from '@/services/queueService';

export const EMPTY_QUEUE: LocalQueuedMessage[] = [];

interface MessageQueueState {
  queues: Map<string, LocalQueuedMessage[]>;
  isSyncing: Map<string, boolean>;

  queueMessage: (
    chatId: string,
    content: string,
    modelId: string,
    permissionMode?: string,
    thinkingMode?: string | null,
    files?: File[],
  ) => Promise<string>;
  updateQueuedMessage: (chatId: string, messageId: string, content: string) => Promise<void>;
  removeAndSync: (chatId: string, messageId: string) => Promise<void>;
  getQueue: (chatId: string) => LocalQueuedMessage[];
  clearQueue: (chatId: string) => void;
  fetchQueue: (chatId: string) => Promise<void>;
  syncPendingMessages: (chatId: string, modelId: string) => Promise<void>;
  removeLocalOnly: (chatId: string, messageId: string) => void;
}

export const useMessageQueueStore = create<MessageQueueState>((set, get) => ({
  queues: new Map<string, LocalQueuedMessage[]>(),
  isSyncing: new Map<string, boolean>(),

  queueMessage: async (
    chatId: string,
    content: string,
    modelId: string,
    permissionMode: string = 'auto',
    thinkingMode: string | null = null,
    files?: File[],
  ): Promise<string> => {
    const currentQueue = get().queues.get(chatId) || [];
    const existingMessage = currentQueue[0];

    if (existingMessage) {
      const appendedContent = existingMessage.content + '\n' + content;
      const mergedFiles = [...(existingMessage.files || []), ...(files || [])];

      set((state) => {
        const nextQueues = new Map(state.queues);
        nextQueues.set(chatId, [
          {
            ...existingMessage,
            content: appendedContent,
            files: mergedFiles.length > 0 ? mergedFiles : undefined,
          },
        ]);
        return { queues: nextQueues };
      });

      if (existingMessage.synced) {
        try {
          const result = await queueService.appendToQueuedMessage(
            chatId,
            existingMessage.id,
            content,
            files,
          );

          set((state) => {
            const nextQueues = new Map(state.queues);
            const queue = nextQueues.get(chatId) || [];
            const updatedQueue = queue.map((msg) =>
              msg.id === existingMessage.id
                ? { ...msg, content: result.content, attachments: result.attachments }
                : msg,
            );
            nextQueues.set(chatId, updatedQueue);
            return { queues: nextQueues };
          });
        } catch (error) {
          console.error('Failed to append to queued message:', error);
        }
      }

      return existingMessage.id;
    }

    const tempId = crypto.randomUUID();
    const tempMessage: LocalQueuedMessage = {
      id: tempId,
      content,
      model_id: modelId,
      files,
      queuedAt: Date.now(),
      synced: false,
    };

    set((state) => {
      const nextQueues = new Map(state.queues);
      nextQueues.set(chatId, [tempMessage]);
      return { queues: nextQueues };
    });

    try {
      const result = await queueService.queueMessage(
        chatId,
        content,
        modelId,
        permissionMode,
        thinkingMode,
        files,
      );

      set((state) => {
        const nextQueues = new Map(state.queues);
        const queue = nextQueues.get(chatId) || [];
        const updatedQueue = queue.map((msg) =>
          msg.id === tempId
            ? { ...msg, id: result.id, synced: true, attachments: result.attachments }
            : msg,
        );
        nextQueues.set(chatId, updatedQueue);
        return { queues: nextQueues };
      });

      return result.id;
    } catch (error) {
      const isNetworkError =
        error instanceof TypeError || (error instanceof Error && error.message.includes('network'));

      if (!isNetworkError) {
        get().removeLocalOnly(chatId, tempId);
        throw error;
      }

      return tempId;
    }
  },

  updateQueuedMessage: async (chatId: string, messageId: string, content: string) => {
    const trimmedContent = content.trim();

    if (!trimmedContent) {
      await get().removeAndSync(chatId, messageId);
      return;
    }

    set((state) => {
      const nextQueues = new Map(state.queues);
      const currentQueue = nextQueues.get(chatId) || [];
      const updatedQueue = currentQueue.map((msg) =>
        msg.id === messageId ? { ...msg, content: trimmedContent } : msg,
      );
      nextQueues.set(chatId, updatedQueue);
      return { queues: nextQueues };
    });

    const message = get()
      .queues.get(chatId)
      ?.find((m) => m.id === messageId);
    if (message?.synced) {
      try {
        await queueService.updateQueuedMessage(chatId, messageId, trimmedContent);
      } catch (error) {
        console.error('Failed to sync message update:', error);
      }
    }
  },

  removeAndSync: async (chatId: string, messageId: string) => {
    const message = get()
      .queues.get(chatId)
      ?.find((m) => m.id === messageId);

    set((state) => {
      const nextQueues = new Map(state.queues);
      const currentQueue = nextQueues.get(chatId) || [];
      const filteredQueue = currentQueue.filter((msg) => msg.id !== messageId);

      if (filteredQueue.length === 0) {
        nextQueues.delete(chatId);
      } else {
        nextQueues.set(chatId, filteredQueue);
      }

      return { queues: nextQueues };
    });

    if (message?.synced) {
      try {
        await queueService.removeQueuedMessage(chatId, messageId);
      } catch (error) {
        console.error('Failed to sync message removal:', error);
      }
    }
  },

  removeLocalOnly: (chatId: string, messageId: string) => {
    set((state) => {
      const nextQueues = new Map(state.queues);
      const currentQueue = nextQueues.get(chatId) || [];
      const filteredQueue = currentQueue.filter((msg) => msg.id !== messageId);

      if (filteredQueue.length === 0) {
        nextQueues.delete(chatId);
      } else {
        nextQueues.set(chatId, filteredQueue);
      }

      return { queues: nextQueues };
    });
  },

  getQueue: (chatId: string) => {
    return get().queues.get(chatId) ?? EMPTY_QUEUE;
  },

  clearQueue: (chatId: string) => {
    set((state) => {
      const nextQueues = new Map(state.queues);
      nextQueues.delete(chatId);
      return { queues: nextQueues };
    });
  },

  fetchQueue: async (chatId: string) => {
    try {
      const response = await queueService.getQueue(chatId);

      set((state) => {
        const nextQueues = new Map(state.queues);
        const existingQueue = nextQueues.get(chatId) || [];

        const serverMessages: LocalQueuedMessage[] = response.items.map((item) => ({
          id: item.id,
          content: item.content,
          model_id: item.model_id,
          attachments: item.attachments,
          queuedAt: new Date(item.queued_at).getTime(),
          synced: true,
        }));

        const serverMessageIds = new Set(serverMessages.map((m) => m.id));
        const pendingMessages = existingQueue.filter(
          (m) => !m.synced && !serverMessageIds.has(m.id),
        );

        nextQueues.set(chatId, [...serverMessages, ...pendingMessages]);
        return { queues: nextQueues };
      });
    } catch (error) {
      console.error('Failed to fetch queue:', error);
    }
  },

  syncPendingMessages: async (chatId: string, modelId: string) => {
    const state = get();
    if (state.isSyncing.get(chatId)) {
      return;
    }

    set((s) => {
      const nextSyncing = new Map(s.isSyncing);
      nextSyncing.set(chatId, true);
      return { isSyncing: nextSyncing };
    });

    try {
      const queue = state.queues.get(chatId) || [];
      const pendingMessages = queue.filter((m) => !m.synced);

      for (const msg of pendingMessages) {
        try {
          const result = await queueService.queueMessage(
            chatId,
            msg.content,
            modelId,
            'auto',
            null,
            msg.files,
          );

          set((s) => {
            const nextQueues = new Map(s.queues);
            const currentQueue = nextQueues.get(chatId) || [];
            const updatedQueue = currentQueue.map((m) =>
              m.id === msg.id
                ? { ...m, id: result.id, synced: true, attachments: result.attachments }
                : m,
            );
            nextQueues.set(chatId, updatedQueue);
            return { queues: nextQueues };
          });
        } catch (error) {
          console.error('Failed to sync pending message:', error);
          break;
        }
      }
    } finally {
      set((s) => {
        const nextSyncing = new Map(s.isSyncing);
        nextSyncing.delete(chatId);
        return { isSyncing: nextSyncing };
      });
    }
  },
}));
