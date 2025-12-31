import { useState, useEffect, useCallback, useRef, memo } from 'react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { FileText, FileSpreadsheet, Download } from 'lucide-react';
import { logger } from '@/utils/logger';
import type { MessageAttachment } from '@/types';
import { Button } from './primitives/Button';
import { cn } from '@/utils/cn';
import { authService } from '@/services/authService';

async function downloadFile(url: string, fileName: string): Promise<void> {
  try {
    const token = authService.getToken();
    const downloadUrl = url.replace('/preview', '/download');
    const response = await fetch(downloadUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  } catch (error) {
    logger.error('File download failed', 'downloadFile', error);
    throw error;
  }
}

interface AttachmentViewerProps {
  attachments?: MessageAttachment[];
}

interface ImageState {
  isLoading: boolean;
  error: boolean;
  imageSrc: string;
}

interface ThumbnailWrapperProps {
  attachment: MessageAttachment;
  onDownload: (url: string, filename: string) => void;
  children: ReactNode;
}

interface IconConfig {
  icon: LucideIcon;
  color: string;
  label: string;
}

const getFileExtension = (filename?: string): string => {
  return filename?.split('.').pop()?.toUpperCase() || '';
};

const getIconConfig = (fileType: string, filename?: string): IconConfig => {
  if (fileType === 'pdf') {
    return {
      icon: FileText,
      color: 'text-error-500 dark:text-error-400',
      label: 'PDF',
    };
  }

  if (fileType === 'xlsx') {
    return {
      icon: FileSpreadsheet,
      color: 'text-success-600 dark:text-success-400',
      label: getFileExtension(filename) || 'XLSX',
    };
  }

  return {
    icon: FileText,
    color: 'text-text-tertiary dark:text-text-dark-tertiary',
    label: 'FILE',
  };
};

const getDefaultFilename = (fileType: string, index: number): string => {
  switch (fileType) {
    case 'pdf':
      return 'document.pdf';
    case 'xlsx':
      return 'spreadsheet.xlsx';
    case 'image':
      return `image-${index}.jpg`;
    default:
      return `file-${index}`;
  }
};

const downloadButtonClass =
  'h-7 w-7 rounded-full bg-black/60 text-white shadow-md backdrop-blur-sm hover:bg-black/70 focus-visible:ring-white/70';

function ThumbnailWrapper({ attachment, onDownload, children }: ThumbnailWrapperProps) {
  const filename = attachment.filename || getDefaultFilename(attachment.file_type, 0);

  return (
    <div className="group/thumbnail relative">
      {children}
      <div className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover/thumbnail:opacity-100">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={(e) => {
            if (attachment.file_type === 'image') {
              e.stopPropagation();
            }
            onDownload(attachment.file_url, filename);
          }}
          className={cn('p-0', downloadButtonClass)}
          aria-label={`Download ${attachment.file_type}`}
        >
          <Download className="h-3.5 w-3.5 text-white" />
        </Button>
      </div>
    </div>
  );
}

function IconThumbnail({ attachment }: { attachment: MessageAttachment }) {
  const { icon: Icon, color, label } = getIconConfig(attachment.file_type, attachment.filename);
  const filename = attachment.filename || getDefaultFilename(attachment.file_type, 0);

  return (
    <div className="relative flex h-32 w-32 flex-col items-center justify-center rounded-md border border-border bg-surface-secondary transition-colors hover:bg-surface-hover dark:border-border-dark dark:bg-surface-dark-secondary dark:hover:bg-surface-dark-hover">
      <Icon className={`h-10 w-10 ${color} mb-2`} />
      <p className="max-w-full truncate px-2 text-center text-xs text-text-secondary dark:text-text-dark-secondary">
        {filename}
      </p>
      <p className="text-2xs text-text-tertiary dark:text-text-dark-tertiary">{label}</p>
    </div>
  );
}

function ImageThumbnail({
  attachment,
  state,
  index,
}: {
  attachment: MessageAttachment;
  state: ImageState;
  index: number;
}) {
  const filename = attachment.filename || getDefaultFilename('image', index);

  if (state.isLoading) {
    return (
      <div className="flex h-32 w-32 items-center justify-center rounded-md bg-surface-secondary dark:bg-surface-dark-secondary">
        <div className="h-4 w-4 animate-pulse rounded-full bg-text-quaternary dark:bg-text-dark-quaternary"></div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex h-32 w-32 items-center justify-center rounded-md border border-border bg-surface-secondary dark:border-border-dark dark:bg-surface-dark-secondary">
        <p className="text-xs text-text-tertiary dark:text-text-dark-tertiary">
          Failed to load image
        </p>
      </div>
    );
  }

  if (state.imageSrc) {
    return (
      <div className="relative inline-block">
        <img
          src={state.imageSrc}
          alt={filename}
          className="block h-32 w-32 cursor-default rounded-md object-cover"
        />
      </div>
    );
  }

  return null;
}

function AttachmentViewerInner({ attachments }: AttachmentViewerProps) {
  const [imageStates, setImageStates] = useState<Record<string, ImageState>>({});
  const loadedIdsRef = useRef<Set<string>>(new Set());

  const handleDownload = useCallback(async (url: string, fileName: string) => {
    if (!url) return;
    await downloadFile(url, fileName);
  }, []);

  useEffect(() => {
    if (!attachments || attachments.length === 0) return;

    const imageAttachments = attachments.filter((a) => a.file_type === 'image');
    if (imageAttachments.length === 0) return;

    const newAttachments = imageAttachments.filter((a) => !loadedIdsRef.current.has(a.id));
    if (newAttachments.length === 0) return;

    const loadImages = async () => {
      for (const attachment of newAttachments) {
        const key = attachment.id;
        loadedIdsRef.current.add(key);

        setImageStates((prev) => ({
          ...prev,
          [key]: { isLoading: true, error: false, imageSrc: '' },
        }));

        try {
          const token = authService.getToken();
          const response = await fetch(attachment.file_url, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);

          setImageStates((prev) => ({
            ...prev,
            [key]: { isLoading: false, error: false, imageSrc: blobUrl },
          }));
        } catch (error) {
          logger.error('Image download failed', 'AttachmentViewer', error);
          loadedIdsRef.current.delete(key);
          setImageStates((prev) => ({
            ...prev,
            [key]: { isLoading: false, error: true, imageSrc: '' },
          }));
        }
      }
    };

    loadImages();
  }, [attachments]);

  useEffect(() => {
    const loadedIds = loadedIdsRef.current;
    return () => {
      setImageStates((prev) => {
        Object.values(prev).forEach((state) => {
          if (state.imageSrc) {
            URL.revokeObjectURL(state.imageSrc);
          }
        });
        return {};
      });
      loadedIds.clear();
    };
  }, []);

  if (!attachments || attachments.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((attachment, index) => {
        if (attachment.file_type === 'image') {
          const state = imageStates[attachment.id] || {
            isLoading: true,
            error: false,
            imageSrc: '',
          };

          return (
            <ThumbnailWrapper
              key={attachment.id}
              attachment={attachment}
              onDownload={handleDownload}
            >
              <ImageThumbnail attachment={attachment} state={state} index={index} />
            </ThumbnailWrapper>
          );
        }

        if (attachment.file_type === 'pdf') {
          return (
            <ThumbnailWrapper
              key={attachment.id}
              attachment={attachment}
              onDownload={handleDownload}
            >
              <IconThumbnail attachment={attachment} />
            </ThumbnailWrapper>
          );
        }

        if (attachment.file_type === 'xlsx') {
          return (
            <ThumbnailWrapper
              key={attachment.id}
              attachment={attachment}
              onDownload={handleDownload}
            >
              <IconThumbnail attachment={attachment} />
            </ThumbnailWrapper>
          );
        }

        return null;
      })}
    </div>
  );
}

export const AttachmentViewer = memo(AttachmentViewerInner);
