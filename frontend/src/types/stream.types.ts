import type { AssistantStreamEvent, MessageAttachment } from './chat.types';

export type StreamState = 'idle' | 'loading' | 'streaming' | 'error';

export interface QueueProcessingData {
  queuedMessageId: string;
  userMessageId: string;
  assistantMessageId: string;
  content: string;
  modelId: string;
  attachments?: MessageAttachment[];
}

export interface ApiStreamResponse {
  source: EventSource;
  messageId: string;
}

export interface ActiveStream {
  id: string;
  chatId: string;
  messageId: string;
  source: EventSource;
  startTime: number;
  isActive: boolean;
  listeners: Array<{ type: string; handler: EventListener }>;
  callbacks?: {
    onChunk?: (event: AssistantStreamEvent, messageId: string) => void;
    onComplete?: (messageId?: string) => void;
    onError?: (error: Error, messageId?: string) => void;
    onQueueProcess?: (data: QueueProcessingData) => void;
  };
}

export interface StreamMetadata {
  chatId: string;
  messageId: string;
  startTime: number;
}

export class StreamProcessingError extends Error {
  constructor(
    message: string,
    public readonly originalError?: Error,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'StreamProcessingError';
    Object.setPrototypeOf(this, StreamProcessingError.prototype);
  }

  getDetailedMessage(): string {
    if (!this.originalError) return this.message;

    if (this.originalError instanceof Error) {
      return `${this.message}: ${this.originalError.message}`;
    }

    return `${this.message}: ${String(this.originalError)}`;
  }
}
