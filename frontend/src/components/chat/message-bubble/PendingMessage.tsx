import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { Clock, X, Pencil, Check, FileText, FileSpreadsheet } from 'lucide-react';
import { UserAvatar } from './MessageAvatars';
import { Button } from '@/components/ui';
import { authService } from '@/services/authService';
import type { LocalQueuedMessage, MessageAttachment as QueueAttachment } from '@/types/queue.types';

interface PendingMessageProps {
  message: LocalQueuedMessage;
  onCancel: (id: string) => void;
  onEdit: (id: string, newContent: string) => void;
}

function AuthenticatedPreview({ attachment }: { attachment: QueueAttachment }) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadImage() {
      try {
        const token = authService.getToken();
        const response = await fetch(attachment.file_url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (!response.ok) throw new Error('Failed to load');
        if (cancelled) return;

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setImageSrc(url);
        setIsLoading(false);
      } catch {
        if (!cancelled) {
          setError(true);
          setIsLoading(false);
        }
      }
    }

    if (attachment.file_type === 'image') {
      loadImage();
    } else {
      setIsLoading(false);
    }

    return () => {
      cancelled = true;
      if (imageSrc) URL.revokeObjectURL(imageSrc);
    };
  }, [attachment.file_url, attachment.file_type]);

  if (attachment.file_type === 'pdf') {
    return (
      <div className="flex h-14 w-14 flex-col items-center justify-center rounded-lg bg-surface-secondary dark:bg-surface-dark-secondary">
        <FileText className="h-6 w-6 text-error-500 dark:text-error-400" />
        <span className="mt-0.5 text-2xs text-text-tertiary dark:text-text-dark-tertiary">PDF</span>
      </div>
    );
  }

  if (attachment.file_type === 'xlsx') {
    return (
      <div className="flex h-14 w-14 flex-col items-center justify-center rounded-lg bg-surface-secondary dark:bg-surface-dark-secondary">
        <FileSpreadsheet className="h-6 w-6 text-success-600 dark:text-success-400" />
        <span className="mt-0.5 text-2xs text-text-tertiary dark:text-text-dark-tertiary">
          Excel
        </span>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-surface-secondary dark:bg-surface-dark-secondary">
        <div className="h-4 w-4 animate-pulse rounded-full bg-text-quaternary dark:bg-text-dark-quaternary" />
      </div>
    );
  }

  if (error || !imageSrc) {
    return (
      <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-surface-secondary dark:bg-surface-dark-secondary">
        <span className="text-2xs text-text-tertiary dark:text-text-dark-tertiary">Error</span>
      </div>
    );
  }

  return (
    <img
      src={imageSrc}
      alt={attachment.filename || 'Attachment'}
      className="h-14 w-14 rounded-lg object-cover"
    />
  );
}

export const PendingMessage = memo(function PendingMessage({
  message,
  onCancel,
  onEdit,
}: PendingMessageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hasLocalFiles = message.files && message.files.length > 0;
  const hasServerAttachments = message.attachments && message.attachments.length > 0;

  const isUploadingFiles = hasLocalFiles && !hasServerAttachments;

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(editContent.length, editContent.length);
    }
  }, [isEditing, editContent.length]);

  const handleStartEdit = useCallback(() => {
    setEditContent(message.content);
    setIsEditing(true);
  }, [message.content]);

  const handleCancelEdit = useCallback(() => {
    setEditContent(message.content);
    setIsEditing(false);
  }, [message.content]);

  const handleSaveEdit = useCallback(() => {
    const trimmed = editContent.trim();
    if (!trimmed) {
      onCancel(message.id);
    } else {
      onEdit(message.id, trimmed);
    }
    setIsEditing(false);
  }, [editContent, message.id, onCancel, onEdit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSaveEdit();
      } else if (e.key === 'Escape') {
        handleCancelEdit();
      }
    },
    [handleSaveEdit, handleCancelEdit],
  );

  return (
    <div className="group rounded-lg px-4 py-2 opacity-60 transition-opacity hover:opacity-80 sm:rounded-2xl sm:px-6 sm:py-3">
      <div className="space-y-1">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex-shrink-0">
            <UserAvatar />
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-2 text-xs sm:gap-3">
            <span className="font-medium text-text-secondary dark:text-text-dark-tertiary">
              You
            </span>
            <span className="text-text-quaternary dark:text-text-dark-quaternary">•</span>
            <span className="flex items-center gap-1 text-text-tertiary dark:text-text-dark-tertiary">
              <Clock className="h-3 w-3" />
              Pending...
            </span>
          </div>
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {!isEditing && (
              <>
                <Button
                  onClick={handleStartEdit}
                  variant="unstyled"
                  className="rounded-lg p-2 text-text-secondary hover:bg-surface-hover hover:text-text-primary dark:text-text-dark-secondary dark:hover:bg-surface-dark-hover dark:hover:text-text-dark-primary"
                  aria-label="Edit message"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  onClick={() => onCancel(message.id)}
                  variant="unstyled"
                  className="rounded-lg p-2 text-text-secondary hover:bg-error-100 hover:text-error-600 dark:text-text-dark-secondary dark:hover:bg-error-500/10 dark:hover:text-error-400"
                  aria-label="Cancel message"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="min-w-0 space-y-2 sm:pl-14">
          {isUploadingFiles && (
            <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-lg bg-surface-secondary dark:bg-surface-dark-secondary">
              <div className="h-4 w-4 animate-pulse rounded-full bg-text-quaternary dark:bg-text-dark-quaternary" />
            </div>
          )}
          {hasServerAttachments && message.attachments && (
            <div className="mb-2 flex flex-wrap gap-2">
              {message.attachments.map((att, idx) => (
                <AuthenticatedPreview key={att.file_url || idx} attachment={att} />
              ))}
            </div>
          )}

          {isEditing ? (
            <div className="space-y-2">
              <textarea
                ref={textareaRef}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={handleKeyDown}
                className="bg-surface-primary dark:bg-surface-dark-primary w-full resize-none rounded-lg border border-border p-3 text-sm text-text-primary focus:border-brand-500 focus:outline-none dark:border-border-dark dark:text-text-dark-primary"
                rows={3}
              />
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleSaveEdit}
                  variant="unstyled"
                  className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600"
                >
                  <Check className="h-3.5 w-3.5" />
                  Save
                </Button>
                <Button
                  onClick={handleCancelEdit}
                  variant="unstyled"
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover dark:text-text-dark-secondary dark:hover:bg-surface-dark-hover"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-text-secondary dark:text-text-dark-secondary">
              <p className="whitespace-pre-wrap leading-5">{message.content}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
