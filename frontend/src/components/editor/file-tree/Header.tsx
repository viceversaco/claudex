import { Files, Download, Loader2, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { SearchInput } from './SearchInput';

export interface HeaderProps {
  onDownload?: () => void;
  isDownloading?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onSearchClear?: () => void;
  onClose?: () => void;
}

export function Header({
  onDownload,
  isDownloading = false,
  onRefresh,
  isRefreshing = false,
  searchQuery = '',
  onSearchChange,
  onSearchClear,
  onClose,
}: HeaderProps) {
  return (
    <div className="flex flex-none flex-col gap-2 border-b border-border p-3 dark:border-border-dark">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-surface-secondary p-1.5 dark:bg-surface-dark-secondary">
            <Files className="h-4 w-4 text-text-tertiary dark:text-text-dark-tertiary" />
          </div>
          <div>
            <h2 className="text-xs font-semibold text-text-primary dark:text-text-dark-primary">
              Project Files
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {onRefresh && (
            <Button
              onClick={onRefresh}
              disabled={isRefreshing}
              variant="unstyled"
              className="rounded-md bg-transparent p-1 text-text-tertiary transition-all hover:bg-surface-hover hover:text-text-primary disabled:cursor-wait disabled:opacity-50 dark:text-text-dark-tertiary dark:hover:bg-surface-dark-hover dark:hover:text-text-dark-primary"
              title="Refresh project files"
            >
              {isRefreshing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          )}

          {onDownload && (
            <Button
              onClick={onDownload}
              disabled={isDownloading}
              variant="unstyled"
              className="rounded-md bg-transparent p-1 text-text-tertiary transition-all hover:bg-surface-hover hover:text-text-primary disabled:cursor-wait disabled:opacity-50 dark:text-text-dark-tertiary dark:hover:bg-surface-dark-hover dark:hover:text-text-dark-primary"
              title="Download project files"
            >
              {isDownloading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
            </Button>
          )}

          {onClose && (
            <Button
              onClick={onClose}
              variant="unstyled"
              className="rounded-md bg-transparent p-1 text-text-tertiary transition-all hover:bg-surface-hover hover:text-text-primary dark:text-text-dark-tertiary dark:hover:bg-surface-dark-hover dark:hover:text-text-dark-primary"
              title="Close file tree"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {onSearchChange && onSearchClear && (
        <SearchInput value={searchQuery} onChange={onSearchChange} onClear={onSearchClear} />
      )}
    </div>
  );
}
