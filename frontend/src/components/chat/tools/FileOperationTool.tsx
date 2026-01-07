import { memo, useState, useCallback } from 'react';
import { FileSearch, FileEdit as FileEditIcon, FilePlus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ToolAggregate, ToolComponent } from '@/types';
import { ToolCard, DiffViewer, ReviewInput } from './common';
import { useReviewStore } from '@/store/reviewStore';

interface FileOperationToolProps {
  tool: ToolAggregate;
  variant: 'read' | 'edit' | 'write';
  chatId?: string;
}

interface PendingReview {
  lineStart: number;
  lineEnd: number;
  selectedCode: string;
  changeType: 'insert' | 'delete' | 'normal';
}

interface TitleConfig {
  inProgress: string;
  completed: string;
  failed: string;
}

interface OperationConfig {
  icon: LucideIcon;
  loadingContent: string;
  titles: TitleConfig;
}

const OPERATION_CONFIGS: Record<'read' | 'edit' | 'write', OperationConfig> = {
  read: {
    icon: FileSearch,
    loadingContent: 'Loading file content...',
    titles: { inProgress: 'Reading', completed: 'Read', failed: 'Failed to read' },
  },
  edit: {
    icon: FileEditIcon,
    loadingContent: 'Applying changes...',
    titles: { inProgress: 'Editing', completed: 'Edited', failed: 'Failed to edit' },
  },
  write: {
    icon: FilePlus,
    loadingContent: 'Writing file...',
    titles: { inProgress: 'Writing', completed: 'Wrote', failed: 'Failed to write' },
  },
};

const normalizeContent = (result: unknown): string => {
  if (typeof result === 'string') return result;
  if (Array.isArray(result)) return result.join('\n');
  if (result === null || result === undefined) return '';
  return JSON.stringify(result, null, 2);
};

const FileOperationToolInner: React.FC<FileOperationToolProps> = ({ tool, variant, chatId }) => {
  const config = OPERATION_CONFIGS[variant];
  const Icon = config.icon;
  const filePath = (tool.input?.file_path as string | undefined) ?? '';

  const [selectedRange, setSelectedRange] = useState<{ start: number; end: number } | null>(null);
  const [pendingReview, setPendingReview] = useState<PendingReview | null>(null);
  const addReview = useReviewStore((s) => s.addReview);

  const handleLineSelect = useCallback(
    (
      lineStart: number,
      lineEnd: number,
      selectedCode: string,
      changeType: 'insert' | 'delete' | 'normal',
    ) => {
      setSelectedRange({ start: lineStart, end: lineEnd });
      setPendingReview({ lineStart, lineEnd, selectedCode, changeType });
    },
    [],
  );

  const handleReviewSubmit = useCallback(
    (comment: string) => {
      if (!pendingReview || !chatId) return;
      addReview({
        id: crypto.randomUUID(),
        chatId,
        filePath,
        operationId: tool.id,
        lineStart: pendingReview.lineStart,
        lineEnd: pendingReview.lineEnd,
        selectedCode: pendingReview.selectedCode,
        changeType: pendingReview.changeType,
        comment,
        createdAt: new Date().toISOString(),
      });
      setSelectedRange(null);
      setPendingReview(null);
    },
    [pendingReview, chatId, filePath, tool.id, addReview],
  );

  const handleReviewCancel = useCallback(() => {
    setSelectedRange(null);
    setPendingReview(null);
  }, []);

  const renderContent = () => {
    if (variant === 'read') {
      const content = normalizeContent(tool.result);
      if (!content || tool.status !== 'completed') return null;

      return (
        <div className="border-t border-border/50 dark:border-border-dark/50">
          <div className="max-h-64 overflow-x-auto font-mono text-xs">
            <div className="flex">
              <div className="flex-shrink-0 select-none border-r border-border px-3 py-3 text-right text-text-tertiary dark:border-border-dark-secondary dark:text-text-dark-tertiary">
                {content.split('\n').map((line: string, idx: number) => {
                  const match = line.match(/^\s*(\d+)→/);
                  const lineNum = match ? match[1] : String(idx + 1);
                  return <div key={idx}>{lineNum}</div>;
                })}
              </div>
              <pre className="flex-1 py-3 pl-4">
                <code className="whitespace-pre text-text-primary dark:text-text-dark-primary">
                  {content.split('\n').map((line: string, idx: number) => {
                    const lineContent = line.replace(/^\s*\d+→/, '');
                    return <div key={idx}>{lineContent || '\u00A0'}</div>;
                  })}
                </code>
              </pre>
            </div>
          </div>
        </div>
      );
    }

    if (variant === 'edit') {
      const oldString = typeof tool.input?.old_string === 'string' ? tool.input.old_string : '';
      const newString = typeof tool.input?.new_string === 'string' ? tool.input.new_string : '';
      if (!oldString && !newString) return null;

      return (
        <div className="border-t border-border/50 p-3 dark:border-border-dark/50">
          <DiffViewer
            oldContent={oldString}
            newContent={newString}
            filename={filePath}
            reviewMode={!!chatId}
            operationId={tool.id}
            onLineSelect={handleLineSelect}
            selectedRange={selectedRange}
          />
          {pendingReview && (
            <ReviewInput
              selectedLines={{ start: pendingReview.lineStart, end: pendingReview.lineEnd }}
              fileName={filePath}
              onSubmit={handleReviewSubmit}
              onCancel={handleReviewCancel}
              className="mt-3"
            />
          )}
        </div>
      );
    }

    const content = typeof tool.input?.content === 'string' ? tool.input.content : '';
    if (!content) return null;

    return (
      <div className="border-t border-border/50 p-3 dark:border-border-dark/50">
        <DiffViewer
          oldContent=""
          newContent={content}
          filename={filePath}
          reviewMode={!!chatId}
          operationId={tool.id}
          onLineSelect={handleLineSelect}
          selectedRange={selectedRange}
        />
        {pendingReview && (
          <ReviewInput
            selectedLines={{ start: pendingReview.lineStart, end: pendingReview.lineEnd }}
            fileName={filePath}
            onSubmit={handleReviewSubmit}
            onCancel={handleReviewCancel}
            className="mt-3"
          />
        )}
      </div>
    );
  };

  const hasExpandableContent =
    (variant === 'read' && tool.result && tool.status === 'completed') ||
    (variant === 'edit' &&
      (typeof tool.input?.old_string === 'string' || typeof tool.input?.new_string === 'string')) ||
    (variant === 'write' && typeof tool.input?.content === 'string' && tool.input.content);

  return (
    <ToolCard
      icon={<Icon className="h-3.5 w-3.5 text-text-secondary dark:text-text-dark-tertiary" />}
      status={tool.status}
      title={(status) => {
        switch (status) {
          case 'completed':
            return `${config.titles.completed} ${filePath}`;
          case 'failed':
            return `${config.titles.failed} ${filePath}`;
          default:
            return `${config.titles.inProgress} ${filePath}`;
        }
      }}
      loadingContent={config.loadingContent}
      error={tool.error}
      expandable={Boolean(hasExpandableContent)}
    >
      {renderContent()}
    </ToolCard>
  );
};

const FileOperationTool = memo(FileOperationToolInner);

export const WriteTool: ToolComponent = ({ tool, chatId }) => (
  <FileOperationTool tool={tool} variant="write" chatId={chatId} />
);

export const ReadTool: ToolComponent = ({ tool, chatId }) => (
  <FileOperationTool tool={tool} variant="read" chatId={chatId} />
);

export const EditTool: ToolComponent = ({ tool, chatId }) => (
  <FileOperationTool tool={tool} variant="edit" chatId={chatId} />
);
