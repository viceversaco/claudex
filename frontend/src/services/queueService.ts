import { apiClient } from '@/lib/api';
import { ensureResponse, serviceCall } from '@/services/base';
import { validateId, validateRequired } from '@/utils/validation';
import type { QueueAddResponse, QueuedMessage, QueueListResponse } from '@/types';

async function queueMessage(
  chatId: string,
  content: string,
  modelId: string,
  permissionMode: string = 'auto',
  thinkingMode: string | null = null,
  files?: File[],
): Promise<QueueAddResponse> {
  validateId(chatId, 'Chat ID');
  validateRequired(content, 'Content');
  validateRequired(modelId, 'Model ID');

  return serviceCall(async () => {
    const formData = new FormData();
    formData.append('content', content);
    formData.append('model_id', modelId);
    formData.append('permission_mode', permissionMode);
    if (thinkingMode) {
      formData.append('thinking_mode', thinkingMode);
    }

    if (files) {
      files.forEach((file) => {
        formData.append('attached_files', file);
      });
    }

    const response = await apiClient.postForm<QueueAddResponse>(
      `/chat/chats/${chatId}/queue`,
      formData,
    );
    return ensureResponse(response, 'Failed to queue message');
  });
}

async function getQueue(chatId: string): Promise<QueueListResponse> {
  validateId(chatId, 'Chat ID');

  return serviceCall(async () => {
    const response = await apiClient.get<QueueListResponse>(`/chat/chats/${chatId}/queue`);
    return response ?? { items: [], count: 0 };
  });
}

async function updateQueuedMessage(
  chatId: string,
  messageId: string,
  content: string,
): Promise<QueuedMessage> {
  validateId(chatId, 'Chat ID');
  validateId(messageId, 'Message ID');
  validateRequired(content, 'Content');

  return serviceCall(async () => {
    const response = await apiClient.patch<QueuedMessage>(
      `/chat/chats/${chatId}/queue/${messageId}`,
      { content },
    );
    return ensureResponse(response, 'Failed to update queued message');
  });
}

async function removeQueuedMessage(chatId: string, messageId: string): Promise<void> {
  validateId(chatId, 'Chat ID');
  validateId(messageId, 'Message ID');

  await serviceCall(async () => {
    await apiClient.delete(`/chat/chats/${chatId}/queue/${messageId}`);
  });
}

export const queueService = {
  queueMessage,
  getQueue,
  updateQueuedMessage,
  removeQueuedMessage,
};
