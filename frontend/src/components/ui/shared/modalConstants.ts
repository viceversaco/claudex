export const Z_INDEX = {
  modal: 50,
  modalHigh: 100,
  modalHighest: 200,
} as const;

export const modalBackdropClass = 'fixed inset-0 bg-black/50 flex items-center justify-center p-4';
export const modalContainerClass =
  'bg-surface-secondary dark:bg-surface-dark-secondary rounded-xl w-full overflow-hidden';

export const closeButtonClass =
  'p-1 text-text-tertiary hover:text-text-secondary dark:hover:text-text-dark-primary rounded-lg transition-colors';
export const cancelButtonClass =
  'px-4 py-2 text-text-secondary dark:text-text-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover rounded-lg transition-colors';

export const modalSizes = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '4xl': 'max-w-4xl',
  full: 'max-w-full',
} as const;
