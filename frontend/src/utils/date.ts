const padTimeUnit = (value: number): string => value.toString().padStart(2, '0');

const parseTimeParts = (time: string): { hours: number; minutes: number; seconds: number } => {
  const [hourStr, minuteStr, secondStr] = time.split(':');
  const hours = Number.parseInt(hourStr ?? '0', 10);
  const minutes = Number.parseInt(minuteStr ?? '0', 10);
  const seconds = Number.parseInt(secondStr ?? '0', 10);

  return {
    hours: Number.isFinite(hours) ? hours : 0,
    minutes: Number.isFinite(minutes) ? minutes : 0,
    seconds: Number.isFinite(seconds) ? seconds : 0,
  };
};

export const localTimeInputToUtc = (time: string): string => {
  const { hours, minutes, seconds } = parseTimeParts(time);
  const local = new Date();
  local.setHours(hours, minutes, seconds, 0);

  const utcHours = padTimeUnit(local.getUTCHours());
  const utcMinutes = padTimeUnit(local.getUTCMinutes());
  const utcSeconds = padTimeUnit(local.getUTCSeconds());

  return `${utcHours}:${utcMinutes}:${utcSeconds}`;
};

export const utcTimeToLocalInput = (time: string): string => {
  const { hours, minutes, seconds } = parseTimeParts(time);
  const now = new Date();
  const utcDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hours, minutes, seconds),
  );

  return `${padTimeUnit(utcDate.getHours())}:${padTimeUnit(utcDate.getMinutes())}`;
};

export const formatLocalTimeFromUtc = (time: string): string => {
  const { hours, minutes, seconds } = parseTimeParts(time);
  const now = new Date();
  const utcDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hours, minutes, seconds),
  );

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(utcDate);
};

export const formatRelativeTime = (date: string | Date): string => {
  const targetDate = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - targetDate.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return 'just now';
  }

  if (diffMinutes < 60) {
    return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
  }

  if (diffHours < 24) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  }

  if (diffDays === 1) {
    return 'yesterday';
  }

  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: now.getFullYear() !== targetDate.getFullYear() ? 'numeric' : undefined,
  }).format(targetDate);
};

export const formatFullTimestamp = (date: string | Date): string => {
  const targetDate = typeof date === 'string' ? new Date(date) : date;

  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(targetDate);
};
