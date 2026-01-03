import { Send, Pause, ListPlus } from 'lucide-react';
import { Button } from '@/components/ui';

export interface SendButtonProps {
  isLoading: boolean;
  isStreaming?: boolean;
  disabled: boolean;
  onClick: (e: React.MouseEvent) => void;
  type?: 'button' | 'submit';
  hasMessage?: boolean;
  className?: string;
}

export function SendButton({
  isLoading,
  isStreaming = false,
  disabled,
  onClick,
  type = 'button',
  hasMessage = false,
  className = '',
}: SendButtonProps) {
  const baseClasses =
    'p-1.5 rounded-full transition-all duration-200 transform disabled:opacity-50 disabled:cursor-not-allowed active:scale-95';

  const scaleClass = hasMessage && !disabled ? 'scale-100' : 'scale-90';

  const showQueueIcon = isStreaming && hasMessage;
  const showStopIcon = (isLoading || isStreaming) && !hasMessage;

  let colorClasses;
  if (showStopIcon) {
    colorClasses = 'bg-error-500 hover:bg-error-600';
  } else if (showQueueIcon) {
    colorClasses = 'bg-brand-500 hover:bg-brand-600';
  } else if (hasMessage) {
    colorClasses = 'bg-text-primary dark:bg-text-dark-primary hover:opacity-80';
  } else {
    colorClasses = 'bg-surface-tertiary dark:bg-surface-dark-tertiary';
  }

  const cursorClass = !isLoading && !isStreaming && !hasMessage ? 'cursor-not-allowed' : '';

  const getAriaLabel = () => {
    if (showStopIcon) return 'Stop generating';
    if (showQueueIcon) return 'Queue message';
    return 'Send message';
  };

  const renderIcon = () => {
    if (showStopIcon) {
      return <Pause className="h-3.5 w-3.5 animate-pulse text-white" />;
    }
    if (showQueueIcon) {
      return <ListPlus className="h-3.5 w-3.5 text-white" />;
    }
    return (
      <Send
        className={`h-3.5 w-3.5 transition-transform ${hasMessage ? 'text-text-dark-primary dark:text-text-primary' : 'text-text-quaternary'}`}
      />
    );
  };

  return (
    <Button
      type={type}
      onClick={onClick}
      disabled={disabled}
      variant="unstyled"
      className={`${baseClasses} ${scaleClass} ${colorClasses} ${cursorClass} ${className}`}
      aria-label={getAriaLabel()}
    >
      {renderIcon()}
    </Button>
  );
}
