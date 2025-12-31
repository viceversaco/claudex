import { memo } from 'react';
import { MessageSquare, MoreHorizontal, Loader2, Pin } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/utils/cn';
import type { Chat } from '@/types';

interface SidebarChatItemProps {
  chat: Chat;
  isSelected: boolean;
  isHovered: boolean;
  isDropdownOpen: boolean;
  isChatStreaming: boolean;
  onSelect: (chatId: string) => void;
  onDropdownClick: (e: React.MouseEvent<HTMLButtonElement>, chatId: string) => void;
  onMouseEnter: (chatId: string) => void;
  onMouseLeave: () => void;
}

export const SidebarChatItem = memo(function SidebarChatItem({
  chat,
  isSelected,
  isHovered,
  isDropdownOpen,
  isChatStreaming,
  onSelect,
  onDropdownClick,
  onMouseEnter,
  onMouseLeave,
}: SidebarChatItemProps) {
  const isPinned = !!chat.pinned_at;

  return (
    <div
      className="group relative flex items-center gap-1"
      onMouseEnter={() => onMouseEnter(chat.id)}
      onMouseLeave={onMouseLeave}
    >
      <Button
        onClick={() => onSelect(chat.id)}
        variant="unstyled"
        className={cn(
          'flex-1 px-2.5 py-1.5 text-left text-sm',
          'rounded-md transition-colors duration-200',
          'flex min-w-0 items-center gap-2',
          isSelected
            ? 'bg-surface-active text-text-primary dark:bg-surface-dark-active dark:text-text-dark-primary'
            : 'text-text-secondary hover:bg-surface-hover dark:text-text-dark-secondary dark:hover:bg-surface-dark-hover',
        )}
      >
        {isChatStreaming ? (
          <Loader2
            className={cn(
              'h-3.5 w-3.5 flex-shrink-0 animate-spin',
              isSelected
                ? 'text-text-primary dark:text-text-dark-primary'
                : 'text-text-tertiary dark:text-text-dark-tertiary',
            )}
          />
        ) : (
          <MessageSquare
            className={cn(
              'h-3.5 w-3.5 flex-shrink-0',
              isSelected
                ? 'text-text-primary dark:text-text-dark-primary'
                : 'text-text-tertiary dark:text-text-dark-tertiary',
            )}
          />
        )}
        <span className="flex-1 truncate">{chat.title}</span>
        {isPinned && (
          <Pin
            className={cn(
              'h-3 w-3 flex-shrink-0',
              isSelected
                ? 'text-text-secondary dark:text-text-dark-secondary'
                : 'text-text-tertiary dark:text-text-dark-tertiary',
            )}
          />
        )}
      </Button>

      <Button
        onClick={(e) => onDropdownClick(e, chat.id)}
        onMouseDown={(e) => e.stopPropagation()}
        variant="unstyled"
        className={cn(
          'flex-shrink-0 rounded p-1 transition-all duration-200',
          'text-text-tertiary dark:text-text-dark-tertiary',
          'hover:text-text-primary dark:hover:text-text-dark-primary',
          'hover:bg-surface-hover dark:hover:bg-surface-dark-hover',
          isHovered || isSelected || isDropdownOpen
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100',
        )}
        aria-label="Chat options"
      >
        <MoreHorizontal className="h-3 w-3" />
      </Button>
    </div>
  );
});
