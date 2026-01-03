import { useStreamStore, useMessageQueueStore } from '@/store';
import type { ChatRequest, AssistantStreamEvent, ActiveStream, QueueProcessingData } from '@/types';
import { StreamProcessingError } from '@/types';
import { chatService } from '@/services/chatService';
import { logger } from '@/utils/logger';
import { chatStorage } from '@/utils/storage';

export interface StreamOptions {
  chatId: string;
  request: ChatRequest;
  onChunk?: (event: AssistantStreamEvent, messageId: string) => void;
  onComplete?: (messageId?: string) => void;
  onError?: (error: Error, messageId?: string) => void;
  onQueueProcess?: (data: QueueProcessingData) => void;
}

interface StreamReconnectOptions {
  chatId: string;
  messageId: string;
  onChunk?: (event: AssistantStreamEvent, messageId: string) => void;
  onComplete?: (messageId?: string) => void;
  onError?: (error: Error, messageId?: string) => void;
  onQueueProcess?: (data: QueueProcessingData) => void;
}

// Singleton service managing EventSource streams for chat completions.
// Subscribes to Zustand store to always have latest state without hook limitations.
class StreamService {
  private store = useStreamStore.getState();
  private queueStore = useMessageQueueStore.getState();

  // Subscribe to store updates so this.store always reflects current state.
  // This pattern allows using Zustand outside of React components.
  constructor() {
    useStreamStore.subscribe((state) => {
      this.store = state;
    });
    useMessageQueueStore.subscribe((state) => {
      this.queueStore = state;
    });
  }

  private parseStreamEvent<T>(data: string): T | null {
    try {
      return JSON.parse(data) as T;
    } catch (err) {
      logger.error('Stream event parsing failed', 'streamService', err);
      return null;
    }
  }

  // Removes stream from store and propagates error to callback if provided.
  // Called on stream errors or completion to ensure proper cleanup.
  private cleanupStream(streamId: string, error?: Error, messageId?: string): void {
    const currentStream = this.store.getStream(streamId);
    if (!currentStream) return;

    this.store.removeStream(streamId);

    if (error && currentStream.callbacks?.onError) {
      currentStream.callbacks.onError(error, messageId);
    }
  }

  private handleContentEvent(
    event: MessageEvent,
    streamId: string,
    _messageId: string,
    chatId: string,
  ): void {
    if (event.lastEventId) {
      chatStorage.setEventId(chatId, event.lastEventId);
    }

    if (!event.data) return;

    const currentStream = this.store.getStream(streamId);
    if (!currentStream) return;

    const parsed = this.parseStreamEvent<{ event?: AssistantStreamEvent }>(event.data);

    if (parsed?.event && currentStream.callbacks?.onChunk) {
      currentStream.callbacks.onChunk(parsed.event, currentStream.messageId);
    }
  }

  private handleErrorEvent(
    event: MessageEvent,
    streamId: string,
    messageId: string,
    chatId: string,
  ): void {
    const currentStream = this.store.getStream(streamId);
    if (currentStream) {
      currentStream.source.close();
    }

    if (event.lastEventId) {
      chatStorage.setEventId(chatId, event.lastEventId);
    }

    let message = 'An error occurred';
    if (event.data) {
      const parsed = this.parseStreamEvent<string | { error?: string }>(event.data);
      if (typeof parsed === 'string') {
        message = parsed;
      } else if (parsed && typeof parsed === 'object' && 'error' in parsed) {
        message = parsed.error ?? message;
      }
    }

    const wrappedError = new StreamProcessingError(
      'Error processing completion stream',
      new Error(message),
    );
    this.cleanupStream(streamId, wrappedError, messageId);
  }

  private handleCompleteEvent(
    event: MessageEvent,
    streamId: string,
    _messageId: string,
    chatId: string,
  ): void {
    if (event.lastEventId) {
      chatStorage.setEventId(chatId, event.lastEventId);
    }

    const currentStream = this.store.getStream(streamId);
    if (!currentStream) return;

    this.store.removeStream(streamId);
    currentStream.callbacks?.onComplete?.(currentStream.messageId);
  }

  private handleQueueProcessingEvent(event: MessageEvent, chatId: string): void {
    if (!event.data) return;

    const parsed = this.parseStreamEvent<{
      queued_message_id?: string;
      user_message_id?: string;
      assistant_message_id?: string;
      content?: string;
      model_id?: string;
      attachments?: Array<{
        id: string;
        message_id: string;
        file_url: string;
        file_type: 'image' | 'pdf' | 'xlsx';
        filename?: string;
        created_at: string;
      }>;
    }>(event.data);

    if (!parsed?.queued_message_id || !parsed?.assistant_message_id) return;

    this.queueStore.removeLocalOnly(chatId, parsed.queued_message_id);

    const stream = this.store.getStreamByChat(chatId);
    if (!stream) return;

    this.store.updateStreamMessageId(chatId, stream.messageId, parsed.assistant_message_id);

    if (stream.callbacks?.onQueueProcess && parsed.user_message_id && parsed.content) {
      stream.callbacks.onQueueProcess({
        queuedMessageId: parsed.queued_message_id,
        userMessageId: parsed.user_message_id,
        assistantMessageId: parsed.assistant_message_id,
        content: parsed.content,
        modelId: parsed.model_id ?? '',
        attachments: parsed.attachments,
      });
    }
  }

  private handleGenericError(event: Event | ErrorEvent, streamId: string, messageId: string): void {
    const currentStream = this.store.getStream(streamId);
    if (currentStream) {
      currentStream.source.close();
    }

    const error =
      event instanceof ErrorEvent && event.error instanceof Error
        ? event.error
        : new Error('Stream connection error');

    const wrappedError = new StreamProcessingError('Stream connection error', error);
    this.cleanupStream(streamId, wrappedError, messageId);
  }

  // Registers event listeners on the EventSource and stores them for cleanup.
  // Listeners array is kept in sync so shutdownStream can remove them all.
  private attachStreamHandlers(streamId: string, messageId: string): void {
    const activeStream = this.store.getStream(streamId);
    if (!activeStream) return;

    const { source, chatId } = activeStream;

    // Helper to both register a listener and track it for later removal
    const register = (type: string, handler: EventListener) => {
      source.addEventListener(type, handler);
      activeStream.listeners.push({ type, handler });
    };

    register('content', (event: Event) =>
      this.handleContentEvent(event as MessageEvent, streamId, messageId, chatId),
    );

    register('error', (event: Event) =>
      this.handleErrorEvent(event as MessageEvent, streamId, messageId, chatId),
    );

    register('complete', (event: Event) =>
      this.handleCompleteEvent(event as MessageEvent, streamId, messageId, chatId),
    );

    register('queue_processing', (event: Event) =>
      this.handleQueueProcessingEvent(event as MessageEvent, chatId),
    );

    register('queue_injected', (event: Event) =>
      this.handleQueueProcessingEvent(event as MessageEvent, chatId),
    );

    source.onerror = (event) => {
      this.handleGenericError(event, streamId, messageId);
    };
  }

  async startStream(options: StreamOptions): Promise<string> {
    const streamId = crypto.randomUUID();

    try {
      const { source, messageId } = await chatService.createCompletion(options.request);

      const activeStream: ActiveStream = {
        id: streamId,
        chatId: options.chatId,
        messageId,
        source,
        startTime: Date.now(),
        isActive: true,
        listeners: [],
        callbacks: {
          onChunk: options.onChunk,
          onComplete: options.onComplete,
          onError: options.onError,
          onQueueProcess: options.onQueueProcess,
        },
      };

      this.store.addStream(activeStream);
      this.attachStreamHandlers(streamId, messageId);

      return messageId;
    } catch (error) {
      this.store.removeStream(streamId);
      throw error;
    }
  }

  stopStream(streamId: string): void {
    this.store.abortStream(streamId);
  }

  async stopStreamByMessage(chatId: string, messageId: string): Promise<void> {
    const stream = this.store.getStreamByChatAndMessage(chatId, messageId);
    if (stream) {
      this.store.abortStream(stream.id);

      try {
        await chatService.stopStream(chatId);
      } catch (error) {
        logger.error('Stream stop failed', 'streamService', error);
      }
    }
  }

  async stopAllStreams(): Promise<void> {
    const activeStreams = this.store.activeStreams;

    const chatIds = new Set<string>();
    activeStreams.forEach((stream) => {
      chatIds.add(stream.chatId);
    });

    this.store.abortAllStreams();

    const results = await Promise.allSettled(
      Array.from(chatIds).map((chatId) => chatService.stopStream(chatId)),
    );

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        logger.error('Batch stream stop failed', 'streamService', {
          chatId: Array.from(chatIds)[index],
          error: result.reason,
        });
      }
    });
  }

  async reconnectToStream(options: StreamReconnectOptions): Promise<string> {
    const streamId = crypto.randomUUID();

    try {
      const { source } = await chatService.reconnectToStream(options.chatId, options.messageId);

      const activeStream: ActiveStream = {
        id: streamId,
        chatId: options.chatId,
        messageId: options.messageId,
        source,
        startTime: Date.now(),
        isActive: true,
        listeners: [],
        callbacks: {
          onChunk: options.onChunk,
          onComplete: options.onComplete,
          onError: options.onError,
          onQueueProcess: options.onQueueProcess,
        },
      };

      this.store.addStream(activeStream);

      this.attachStreamHandlers(streamId, options.messageId);

      return options.messageId;
    } catch (error) {
      this.store.removeStream(streamId);
      throw error;
    }
  }

  // Replays a stream from the beginning by clearing the lastEventId.
  // Unlike reconnectToStream which resumes from where it left off,
  // this forces a full replay of all events for the message.
  async replayStream(options: StreamReconnectOptions): Promise<string> {
    chatStorage.removeEventId(options.chatId);
    return this.reconnectToStream(options);
  }
}

export const streamService = new StreamService();
