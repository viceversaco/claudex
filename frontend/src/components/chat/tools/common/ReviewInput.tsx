import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/primitives/Button';
import { Textarea } from '@/components/ui/primitives/Textarea';
import { cn } from '@/utils/cn';

interface ReviewInputProps {
  selectedLines: {
    start: number;
    end: number;
  };
  fileName: string;
  onSubmit: (comment: string) => void;
  onCancel: () => void;
  className?: string;
}

export function ReviewInput({
  selectedLines,
  fileName,
  onSubmit,
  onCancel,
  className,
}: ReviewInputProps) {
  const [comment, setComment] = useState('');

  const handleSubmit = () => {
    if (comment.trim()) {
      onSubmit(comment.trim());
      setComment('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const lineRange =
    selectedLines.start === selectedLines.end
      ? `Line ${selectedLines.start}`
      : `Lines ${selectedLines.start}-${selectedLines.end}`;

  return (
    <div
      className={cn(
        'rounded-lg border border-border dark:border-border-dark',
        'bg-surface dark:bg-surface-dark',
        'space-y-3 p-4',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="text-sm font-medium text-text-primary dark:text-text-dark-primary">
            Add Review Comment
          </div>
          <div className="mt-0.5 text-xs text-text-tertiary dark:text-text-dark-tertiary">
            {fileName} • {lineRange}
          </div>
        </div>
        <button
          onClick={onCancel}
          className={cn(
            'rounded p-1 hover:bg-surface-hover dark:hover:bg-surface-dark-hover',
            'text-text-tertiary dark:text-text-dark-tertiary',
            'hover:text-text-primary dark:hover:text-text-dark-primary',
            'transition-colors',
          )}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Write your review comment... (Cmd/Ctrl+Enter to submit, Esc to cancel)"
        className="min-h-24"
        autoFocus
      />

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={handleSubmit} disabled={!comment.trim()}>
          Add Review
        </Button>
      </div>
    </div>
  );
}
