import { memo, useCallback, useMemo, useState } from 'react';
import { CheckCircle2, Copy, GitFork, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MessageContent } from './MessageContent';
import { UserAvatar, BotAvatar } from './MessageAvatars';
import { useModelsQuery, useForkChatMutation, useRestoreCheckpointMutation } from '@/hooks/queries';
import type { MessageAttachment } from '@/types';
import { ConfirmDialog, LoadingOverlay, Button, Spinner, Badge, Tooltip } from '@/components/ui';
import { formatRelativeTime, formatFullTimestamp } from '@/utils/date';
import toast from 'react-hot-toast';
import { useChatContext } from '@/hooks/useChatContext';
import { SandboxProvider } from '@/config/constants';

export interface MessageProps {
  id: string;
  content: string;
  isBot: boolean;
  attachments?: MessageAttachment[];
  copiedMessageId: string | null;
  onCopy: (content: string, id: string) => void;
  error?: string | null;
  isThisMessageStreaming: boolean;
  isGloballyStreaming: boolean;
  createdAt?: string;
  modelId?: string;
  isLastBotMessageWithCommit?: boolean;
  onRestoreSuccess?: () => void;
}

export const Message = memo(function Message({
  id,
  content,
  isBot,
  attachments,
  copiedMessageId,
  onCopy,
  isThisMessageStreaming,
  isGloballyStreaming,
  createdAt,
  modelId,
  isLastBotMessageWithCommit,
  onRestoreSuccess,
}: MessageProps) {
  const { chatId, sandboxId, sandboxProvider } = useChatContext();
  const { data: models = [] } = useModelsQuery();
  const navigate = useNavigate();
  const [isRestoring, setIsRestoring] = useState(false);
  const [isForking, setIsForking] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const restoreMutation = useRestoreCheckpointMutation({
    onSuccess: () => {
      setIsRestoring(false);
      setShowConfirmDialog(false);
      toast.success('Checkpoint restored successfully');
      onRestoreSuccess?.();
    },
    onError: () => {
      toast.error('Failed to restore checkpoint. Please try again.');
      setIsRestoring(false);
      setShowConfirmDialog(false);
    },
  });

  const forkMutation = useForkChatMutation({
    onSuccess: (data) => {
      setIsForking(false);
      toast.success(`Chat forked with ${data.messages_copied} messages`);
      navigate(`/chat/${data.chat.id}`);
    },
    onError: () => {
      toast.error('Failed to fork chat. Please try again.');
      setIsForking(false);
    },
  });

  const handleRestore = useCallback(() => {
    if (!chatId || isRestoring) return;
    setShowConfirmDialog(true);
  }, [chatId, isRestoring]);

  const handleConfirmRestore = useCallback(() => {
    if (!chatId || !id) return;
    setIsRestoring(true);
    restoreMutation.mutate({ chatId, messageId: id, sandboxId });
  }, [chatId, id, sandboxId, restoreMutation]);

  const handleFork = useCallback(() => {
    if (!chatId || isForking) return;
    setIsForking(true);
    forkMutation.mutate({ chatId, messageId: id });
  }, [chatId, id, isForking, forkMutation]);

  const relativeTime = useMemo(() => (createdAt ? formatRelativeTime(createdAt) : ''), [createdAt]);

  const fullTimestamp = useMemo(
    () => (createdAt ? formatFullTimestamp(createdAt) : ''),
    [createdAt],
  );

  const modelName = useMemo(() => {
    if (!modelId) return null;
    const model = models.find((m) => m.model_id === modelId);
    return model?.name || modelId;
  }, [modelId, models]);

  return (
    <div className="group rounded-lg px-4 py-2 sm:rounded-2xl sm:px-6 sm:py-3">
      <div className="space-y-1">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex-shrink-0">{isBot ? <BotAvatar /> : <UserAvatar />}</div>
          <div className="flex flex-wrap items-center gap-2 text-xs sm:gap-3">
            <span
              className={`${isBot ? 'font-medium text-text-secondary dark:text-text-dark-tertiary' : 'font-bold text-text-secondary dark:text-text-dark-tertiary'}`}
            >
              {isBot ? 'Claudex' : 'You'}
            </span>
            {relativeTime && (
              <>
                <span className="text-text-quaternary dark:text-text-dark-quaternary">•</span>
                <Tooltip content={fullTimestamp} position="bottom">
                  <span className="cursor-default text-text-tertiary dark:text-text-dark-tertiary">
                    {relativeTime}
                  </span>
                </Tooltip>
              </>
            )}
            {isBot && modelId && (
              <>
                <span className="text-text-quaternary dark:text-text-dark-quaternary">•</span>
                <Badge>{modelName}</Badge>
              </>
            )}
          </div>
        </div>

        <div className="min-w-0 space-y-2 sm:pl-14">
          <div
            className={`prose prose-sm max-w-none break-words ${
              isBot
                ? 'text-text-primary dark:text-text-dark-primary'
                : 'font-semibold text-text-primary dark:text-text-dark-secondary'
            }`}
          >
            <MessageContent
              content={content}
              isBot={isBot}
              attachments={attachments}
              isStreaming={isThisMessageStreaming}
              chatId={chatId}
            />
          </div>

          {isBot && content.trim() && !isThisMessageStreaming && (
            <div className="pt-2">
              <div className="mt-2 flex items-center gap-2">
                <Button
                  onClick={() => onCopy(content, id)}
                  variant="unstyled"
                  className={`relative overflow-hidden rounded-xl px-1.5 py-0.5 transition-all duration-200 sm:px-1.5 sm:py-0.5 ${
                    copiedMessageId === id
                      ? 'bg-success-100 text-success-600 dark:bg-success-500/10 dark:text-success-400'
                      : 'text-text-secondary opacity-70 hover:bg-surface-secondary hover:text-text-primary hover:opacity-100 dark:text-text-dark-secondary dark:hover:bg-surface-dark-hover dark:hover:text-text-dark-primary'
                  }`}
                >
                  <div className="relative z-10 flex items-center gap-1.5">
                    {copiedMessageId === id ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="hidden text-xs sm:inline">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        <span className="hidden text-xs sm:inline">Copy</span>
                      </>
                    )}
                  </div>
                </Button>

                {!isLastBotMessageWithCommit && (
                  <>
                    <Button
                      onClick={handleRestore}
                      disabled={isRestoring || isGloballyStreaming}
                      variant="unstyled"
                      className={`relative rounded-xl px-1.5 py-0.5 transition-all duration-200 sm:px-1.5 sm:py-0.5 ${
                        isRestoring || isGloballyStreaming
                          ? 'cursor-not-allowed opacity-50'
                          : 'text-text-secondary opacity-70 hover:bg-surface-secondary hover:text-text-primary hover:opacity-100 dark:text-text-dark-secondary dark:hover:bg-surface-dark-hover dark:hover:text-text-dark-primary'
                      }`}
                      title="Restore to this message"
                    >
                      <div className="relative z-10 flex items-center gap-1.5">
                        {isRestoring ? (
                          <>
                            <Spinner size="md" />
                            <span className="hidden text-xs sm:inline">Restoring...</span>
                          </>
                        ) : (
                          <>
                            <RotateCcw className="h-4 w-4" />
                            <span className="hidden text-xs sm:inline">Restore</span>
                          </>
                        )}
                      </div>
                    </Button>

                    {sandboxProvider === SandboxProvider.DOCKER && sandboxId && (
                      <Button
                        onClick={handleFork}
                        disabled={isForking || isGloballyStreaming}
                        variant="unstyled"
                        className={`relative rounded-xl px-1.5 py-0.5 transition-all duration-200 sm:px-1.5 sm:py-0.5 ${
                          isForking || isGloballyStreaming
                            ? 'cursor-not-allowed opacity-50'
                            : 'text-text-secondary opacity-70 hover:bg-surface-secondary hover:text-text-primary hover:opacity-100 dark:text-text-dark-secondary dark:hover:bg-surface-dark-hover dark:hover:text-text-dark-primary'
                        }`}
                        title="Fork chat from this message"
                      >
                        <div className="relative z-10 flex items-center gap-1.5">
                          {isForking ? (
                            <>
                              <Spinner size="md" />
                              <span className="hidden text-xs sm:inline">Forking...</span>
                            </>
                          ) : (
                            <>
                              <GitFork className="h-4 w-4" />
                              <span className="hidden text-xs sm:inline">Fork</span>
                            </>
                          )}
                        </div>
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        onConfirm={handleConfirmRestore}
        title="Restore to This Message"
        message="Restore conversation to this message? Newer messages will be deleted."
        confirmLabel="Restore"
        cancelLabel="Cancel"
      />

      <LoadingOverlay isOpen={isRestoring} message="Restoring checkpoint..." />
      <LoadingOverlay isOpen={isForking} message="Forking chat..." />
    </div>
  );
});
