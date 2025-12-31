import { memo } from 'react';
import { AlertTriangle, Code, FileText, Save, Loader2, PanelLeft } from 'lucide-react';
import type { FileStructure } from '@/types';
import { Button } from '@/components/ui';
import { isPreviewableFile } from '@/utils/fileTypes';
import { cn } from '@/utils/cn';

export interface HeaderProps {
  filePath?: string;
  error: string | null;
  selectedFile?: FileStructure | null;
  showPreview?: boolean;
  onTogglePreview?: (showPreview: boolean) => void;
  hasUnsavedChanges?: boolean;
  isSaving?: boolean;
  onSave?: () => void;
  onToggleFileTree?: () => void;
}

export const Header = memo(function Header({
  filePath,
  error,
  selectedFile,
  showPreview = false,
  onTogglePreview,
  hasUnsavedChanges = false,
  isSaving = false,
  onSave,
  onToggleFileTree,
}: HeaderProps) {
  const isPreviewable = selectedFile ? isPreviewableFile(selectedFile) : false;

  if (!filePath) return null;

  return (
    <div className="flex items-center justify-between border-b border-border bg-surface px-3 py-1.5 dark:border-border-dark dark:bg-surface-dark">
      <div className="flex min-w-0 items-center gap-2">
        {onToggleFileTree && (
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
        )}
        <span className="truncate text-xs text-text-secondary dark:text-text-dark-secondary">
          {filePath}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {error && (
          <div className="flex items-center gap-1.5 text-error-500 dark:text-error-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="text-xs">{error}</span>
          </div>
        )}

        {onSave && (
          <Button
            onClick={onSave}
            disabled={isSaving || !hasUnsavedChanges}
            variant="unstyled"
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors ${
              !hasUnsavedChanges || isSaving
                ? 'cursor-not-allowed bg-surface-secondary text-text-quaternary opacity-50 dark:bg-surface-dark-secondary'
                : 'bg-brand-500 text-white hover:bg-brand-600'
            }`}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" />
                Save
              </>
            )}
          </Button>
        )}

        {isPreviewable && (
          <Button
            onClick={() => (onTogglePreview ? onTogglePreview(!showPreview) : null)}
            variant="unstyled"
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-all ${
              showPreview
                ? 'bg-brand-500 text-white hover:bg-brand-600'
                : 'bg-surface-secondary text-text-secondary hover:bg-surface-hover dark:bg-surface-dark-secondary dark:text-text-dark-secondary dark:hover:bg-surface-dark-hover'
            }`}
          >
            {showPreview ? (
              <>
                <Code className="h-3.5 w-3.5" />
                Show Code
              </>
            ) : (
              <>
                <FileText className="h-3.5 w-3.5" />
                Preview
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
});
