import { memo } from 'react';
import { PanelLeft } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface EmptyStateProps {
  theme: string;
  onToggleFileTree?: () => void;
}

export const EmptyState = memo(function EmptyState({ theme, onToggleFileTree }: EmptyStateProps) {
  return (
    <div
      className={`flex h-full flex-col ${theme === 'light' ? 'bg-surface-secondary' : 'bg-surface-dark-secondary'}`}
    >
      {onToggleFileTree && (
        <div className="flex items-center border-b border-border px-3 py-1.5 dark:border-border-dark">
          <button
            onClick={onToggleFileTree}
            className={cn(
              'shrink-0 rounded-md p-1',
              'bg-surface-secondary dark:bg-surface-dark-secondary',
              'hover:bg-surface-hover dark:hover:bg-surface-dark-hover',
              'text-text-secondary dark:text-text-dark-secondary',
              'transition-colors duration-150',
            )}
            aria-label="Show file tree"
          >
            <PanelLeft size={16} />
          </button>
        </div>
      )}
      <div className="flex flex-1 items-center justify-center text-sm text-text-secondary dark:text-text-dark-primary">
        Select a file to view its contents
      </div>
    </div>
  );
});
