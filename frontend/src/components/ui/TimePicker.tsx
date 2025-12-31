import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/utils/cn';
import { baseInputClasses } from './primitives/inputStyles';

interface TimePickerProps {
  value: string;
  onChange: (time: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

type Period = 'AM' | 'PM';

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const QUICK_TIMES = [
  { label: '9 AM', hour: 9, minute: 0, period: 'AM' as Period },
  { label: '12 PM', hour: 12, minute: 0, period: 'PM' as Period },
  { label: '3 PM', hour: 3, minute: 0, period: 'PM' as Period },
  { label: '6 PM', hour: 6, minute: 0, period: 'PM' as Period },
];

function formatDisplayTime(time: string): string {
  if (!time || !time.includes(':')) return '';
  const parts = time.split(':');
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (isNaN(hours) || isNaN(minutes)) return '';
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHour}:${minutes.toString().padStart(2, '0')} ${period}`;
}

function to24Hour(hour: number, period: Period): number {
  if (period === 'AM') {
    return hour === 12 ? 0 : hour;
  }
  return hour === 12 ? 12 : hour + 12;
}

function from24Hour(hours: number): { hour: number; period: Period } {
  if (hours === 0) return { hour: 12, period: 'AM' };
  if (hours === 12) return { hour: 12, period: 'PM' };
  if (hours > 12) return { hour: hours - 12, period: 'PM' };
  return { hour: hours, period: 'AM' };
}

export function TimePicker({
  value,
  onChange,
  placeholder = 'Select time',
  disabled = false,
  className,
}: TimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedHour, setSelectedHour] = useState(9);
  const [selectedMinute, setSelectedMinute] = useState(0);
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('AM');

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value && value.includes(':')) {
      const parts = value.split(':');
      const hours = Number(parts[0]);
      const minutes = Number(parts[1]);
      if (!isNaN(hours) && !isNaN(minutes)) {
        const { hour, period } = from24Hour(hours);
        setSelectedHour(hour);
        const roundedMinutes = MINUTES.reduce((prev, curr) =>
          Math.abs(curr - minutes) < Math.abs(prev - minutes) ? curr : prev,
        );
        setSelectedMinute(roundedMinutes);
        setSelectedPeriod(period);
      }
    }
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleTimeChange = useCallback(
    (hour: number, minute: number, period: Period) => {
      const hour24 = to24Hour(hour, period);
      const timeString = `${hour24.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      onChange(timeString);
    },
    [onChange],
  );

  const handleHourSelect = (hour: number) => {
    setSelectedHour(hour);
    handleTimeChange(hour, selectedMinute, selectedPeriod);
  };

  const handleMinuteSelect = (minute: number) => {
    setSelectedMinute(minute);
    handleTimeChange(selectedHour, minute, selectedPeriod);
  };

  const handlePeriodToggle = () => {
    const newPeriod = selectedPeriod === 'AM' ? 'PM' : 'AM';
    setSelectedPeriod(newPeriod);
    handleTimeChange(selectedHour, selectedMinute, newPeriod);
  };

  const handleQuickTime = (qt: (typeof QUICK_TIMES)[0]) => {
    setSelectedHour(qt.hour);
    setSelectedMinute(qt.minute);
    setSelectedPeriod(qt.period);
    handleTimeChange(qt.hour, qt.minute, qt.period);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (!isOpen && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setIsOpen(true);
    }
  };

  const displayTime = `${selectedHour}:${selectedMinute.toString().padStart(2, '0')}`;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={value ? `Selected time: ${formatDisplayTime(value)}` : placeholder}
        className={cn(
          'flex h-10 w-full items-center justify-between text-left',
          baseInputClasses,
          className,
        )}
      >
        <span className={value ? '' : 'text-text-tertiary dark:text-text-dark-tertiary'}>
          {value ? formatDisplayTime(value) : placeholder}
        </span>
        <Clock className="h-4 w-4 text-text-quaternary dark:text-text-dark-quaternary" />
      </button>

      {isOpen && !disabled && (
        <div
          role="dialog"
          aria-label="Time picker"
          onKeyDown={handleKeyDown}
          className="absolute bottom-full left-0 z-50 mb-1.5 w-[240px] overflow-hidden rounded-lg border border-border/50 bg-surface shadow-strong dark:border-white/10 dark:bg-surface-dark"
        >
          <div className="bg-brand-500 px-4 py-2.5">
            <div className="flex items-center justify-center gap-2">
              <span className="text-xl font-semibold tabular-nums text-white">{displayTime}</span>
              <button
                type="button"
                onClick={handlePeriodToggle}
                className="rounded bg-white/20 px-1.5 py-0.5 text-xs font-medium text-white transition-colors hover:bg-white/40"
              >
                {selectedPeriod}
              </button>
            </div>
          </div>

          <div className="p-2.5">
            <div className="mb-2.5 flex gap-1">
              {QUICK_TIMES.map((qt) => (
                <button
                  key={qt.label}
                  type="button"
                  onClick={() => handleQuickTime(qt)}
                  className={cn(
                    'flex-1 rounded py-1 text-2xs font-medium transition-colors',
                    selectedHour === qt.hour &&
                      selectedMinute === qt.minute &&
                      selectedPeriod === qt.period
                      ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300'
                      : 'bg-surface-secondary text-text-secondary hover:bg-surface-hover dark:bg-surface-dark-secondary dark:text-text-dark-secondary dark:hover:bg-surface-dark-hover',
                  )}
                >
                  {qt.label}
                </button>
              ))}
            </div>

            <div className="mb-2">
              <div className="mb-1 text-2xs font-medium uppercase tracking-wide text-text-tertiary dark:text-text-dark-tertiary">
                Hour
              </div>
              <div className="grid grid-cols-6 gap-0.5">
                {HOURS.map((hour) => (
                  <button
                    key={hour}
                    type="button"
                    onClick={() => handleHourSelect(hour)}
                    className={cn(
                      'rounded py-1.5 text-xs font-medium transition-all',
                      selectedHour === hour
                        ? 'bg-brand-500 text-white'
                        : 'text-text-primary hover:bg-surface-hover dark:text-text-dark-primary dark:hover:bg-surface-dark-hover',
                    )}
                  >
                    {hour}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1 text-2xs font-medium uppercase tracking-wide text-text-tertiary dark:text-text-dark-tertiary">
                Minute
              </div>
              <div className="grid grid-cols-6 gap-0.5">
                {MINUTES.map((minute) => (
                  <button
                    key={minute}
                    type="button"
                    onClick={() => handleMinuteSelect(minute)}
                    className={cn(
                      'rounded py-1.5 text-xs font-medium transition-all',
                      selectedMinute === minute
                        ? 'bg-brand-500 text-white'
                        : 'text-text-primary hover:bg-surface-hover dark:text-text-dark-primary dark:hover:bg-surface-dark-hover',
                    )}
                  >
                    {minute.toString().padStart(2, '0')}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-2.5 flex justify-center">
              <div className="inline-flex rounded-md bg-surface-secondary p-0.5 dark:bg-surface-dark-secondary">
                {(['AM', 'PM'] as const).map((period) => (
                  <button
                    key={period}
                    type="button"
                    onClick={() => {
                      setSelectedPeriod(period);
                      handleTimeChange(selectedHour, selectedMinute, period);
                    }}
                    className={cn(
                      'rounded px-3 py-1 text-xs font-medium transition-all',
                      selectedPeriod === period
                        ? 'bg-surface-active text-text-primary shadow-sm dark:bg-surface-dark-active dark:text-text-dark-primary'
                        : 'text-text-tertiary hover:text-text-primary dark:text-text-dark-tertiary dark:hover:text-text-dark-primary',
                    )}
                  >
                    {period}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
