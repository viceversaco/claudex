import { memo } from 'react';
import { User } from 'lucide-react';
import { useAuthStore } from '@/store';
import { useCurrentUserQuery } from '@/hooks/queries';
import { cn } from '@/utils/cn';
import iconDark from '/assets/images/icon-dark.svg';
import iconLight from '/assets/images/icon-white.svg';

interface AvatarWrapperProps {
  children: React.ReactNode;
}

const AvatarWrapper = ({ children }: AvatarWrapperProps) => (
  <div className="group relative">
    <div className="absolute inset-0 rounded-full bg-gradient-to-br from-brand-500/20 to-brand-600/20 opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-100 dark:from-brand-400/20 dark:to-brand-500/20" />
    <div className="relative flex items-center justify-center rounded-full border border-border bg-surface p-2 shadow-sm backdrop-blur-sm transition-all duration-200 group-hover:border-border-secondary dark:border-border-dark dark:bg-surface-dark dark:group-hover:border-border-dark-hover sm:p-2.5">
      {children}
    </div>
  </div>
);

export const UserAvatarCircle = memo(
  ({ displayName, size = 'default' }: { displayName: string; size?: 'default' | 'large' }) => {
    const sizeClasses = size === 'large' ? 'w-8 h-8' : 'w-6 h-6';
    const iconSize = size === 'large' ? 'w-4 h-4' : 'w-3 h-3';

    return (
      <div
        className={cn(
          sizeClasses,
          'rounded-full bg-gradient-to-br from-brand-500 to-brand-600',
          'flex items-center justify-center text-xs font-semibold text-white',
          'shadow-sm transition-all duration-200 group-hover:shadow-md',
        )}
      >
        {displayName?.[0]?.toUpperCase() || <User className={iconSize} />}
      </div>
    );
  },
);

UserAvatarCircle.displayName = 'UserAvatarCircle';

export const UserAvatar = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const { data: user } = useCurrentUserQuery({
    enabled: isAuthenticated,
  });

  const displayName = user?.username || user?.email || 'User';

  return (
    <div className="group relative">
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-brand-500/20 to-brand-600/20 opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-100 dark:from-brand-400/20 dark:to-brand-500/20" />
      <div className="relative flex items-center justify-center rounded-full border-2 border-blue-500/30 bg-surface p-2 shadow-sm backdrop-blur-sm transition-all duration-200 group-hover:border-blue-500/50 dark:border-blue-400/30 dark:bg-surface-dark dark:group-hover:border-blue-400/50 sm:p-2.5">
        <div className="flex h-4 w-4 items-center justify-center text-xs font-semibold text-text-secondary dark:text-text-dark-secondary">
          {displayName?.[0]?.toUpperCase() || <User className="h-4 w-4" />}
        </div>
      </div>
    </div>
  );
};

export const BotAvatar = () => (
  <AvatarWrapper>
    <img src={iconDark} alt="Claudex" className="h-4 w-4 dark:hidden" />
    <img src={iconLight} alt="Claudex" className="hidden h-4 w-4 dark:block" />
  </AvatarWrapper>
);
