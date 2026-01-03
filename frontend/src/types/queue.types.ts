export interface MessageAttachment {
  file_url: string;
  file_path?: string;
  file_type: string;
  filename?: string;
}

export interface QueuedMessage {
  id: string;
  content: string;
  model_id: string;
  queued_at: string;
  attachments?: MessageAttachment[];
}

export interface QueueUpsertResponse {
  id: string;
  created: boolean;
  content: string;
  attachments?: MessageAttachment[];
}

export interface LocalQueuedMessage {
  id: string;
  content: string;
  model_id: string;
  files?: File[];
  attachments?: MessageAttachment[];
  queuedAt: number;
  synced: boolean;
}
