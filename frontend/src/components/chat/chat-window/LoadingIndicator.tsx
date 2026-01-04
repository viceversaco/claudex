import { memo } from 'react';
import iconDark from '/assets/images/icon-dark.svg';
import iconLight from '/assets/images/icon-white.svg';

export const LoadingIndicator = memo(function LoadingIndicator() {
  return (
    <div className="flex items-center justify-center gap-3 pb-2 pt-4">
      <div className="relative">
        <img
          src={iconDark}
          alt="Claudex"
          className="animate-float h-5 w-5 animate-pulse dark:hidden"
        />
        <img
          src={iconLight}
          alt="Claudex"
          className="animate-float hidden h-5 w-5 animate-pulse dark:block"
        />
        <div className="absolute inset-0 animate-ping rounded-full bg-text-secondary/20 dark:bg-text-dark-secondary/20" />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-sm text-text-tertiary dark:text-text-dark-tertiary">
          Claudex is thinking
        </span>
        <div className="flex gap-1">
          <div className="h-1 w-1 animate-pulse rounded-full bg-text-tertiary dark:bg-text-dark-tertiary"></div>
          <div
            className="h-1 w-1 animate-pulse rounded-full bg-text-tertiary dark:bg-text-dark-tertiary"
            style={{ animationDelay: '0.2s' }}
          ></div>
          <div
            className="h-1 w-1 animate-pulse rounded-full bg-text-tertiary dark:bg-text-dark-tertiary"
            style={{ animationDelay: '0.4s' }}
          ></div>
        </div>
      </div>
    </div>
  );
});
