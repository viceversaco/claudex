import { useState, useCallback } from 'react';
import type { FC } from 'react';
import { TerminalTab } from './TerminalTab';

export interface ContainerProps {
  sandboxId?: string;
  chatId?: string;
  isVisible: boolean;
}

interface TerminalInstance {
  id: string;
  label: string;
}

export const Container: FC<ContainerProps> = ({ sandboxId, isVisible }) => {
  const [terminals, setTerminals] = useState<TerminalInstance[]>([
    { id: 'terminal-1', label: 'Terminal 1' },
  ]);
  const [activeTerminalId, setActiveTerminalId] = useState<string>('terminal-1');

  const addTerminal = useCallback(() => {
    setTerminals((prev) => {
      const existingNumbers = new Set(prev.map((t) => parseInt(t.id.split('-')[1], 10)));

      let nextNumber = 1;
      while (existingNumbers.has(nextNumber)) {
        nextNumber += 1;
      }

      const newTerminal: TerminalInstance = {
        id: `terminal-${nextNumber}`,
        label: `Terminal ${nextNumber}`,
      };

      setActiveTerminalId(newTerminal.id);
      return [...prev, newTerminal];
    });
  }, []);

  const closeTerminal = useCallback((terminalId: string) => {
    setTerminals((prev) => {
      const filtered = prev.filter((t) => t.id !== terminalId);
      if (filtered.length === 0) {
        setActiveTerminalId('terminal-1');
        return [{ id: 'terminal-1', label: 'Terminal 1' }];
      }

      setActiveTerminalId((current) => {
        if (current === terminalId) {
          const currentIndex = prev.findIndex((t) => t.id === terminalId);
          const nextTerminal = prev[currentIndex - 1] || prev[currentIndex + 1];
          return nextTerminal?.id || filtered[0]?.id || 'terminal-1';
        }
        return current;
      });

      return filtered;
    });
  }, []);

  return (
    <div className="flex h-full flex-col bg-surface-secondary dark:bg-surface-dark-secondary">
      {/* Tab bar */}
      <div className="flex items-center overflow-x-auto border-b border-border bg-surface-secondary dark:border-border-dark dark:bg-surface-dark-secondary">
        {terminals.map((terminal) => (
          <div
            key={terminal.id}
            className={`flex cursor-pointer items-center gap-2 border-r border-border px-3 py-2 text-xs dark:border-border-dark ${
              activeTerminalId === terminal.id
                ? 'bg-surface-secondary text-text-primary dark:bg-surface-dark-secondary dark:text-text-dark-primary'
                : 'text-text-secondary hover:bg-surface-hover dark:text-text-dark-secondary dark:hover:bg-surface-dark-hover'
            }`}
            onClick={() => setActiveTerminalId(terminal.id)}
          >
            <span>{terminal.label}</span>
            {terminals.length > 1 && (
              <button
                className="hover:text-text-primary dark:hover:text-text-dark-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTerminal(terminal.id);
                }}
                aria-label={`Close ${terminal.label}`}
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button
          className="flex items-center justify-center px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary dark:text-text-dark-secondary dark:hover:bg-surface-dark-hover dark:hover:text-text-dark-primary"
          onClick={addTerminal}
          aria-label="Add new terminal"
        >
          +
        </button>
      </div>

      {/* Terminal instances */}
      <div className="relative flex-1 overflow-hidden">
        {terminals.map((terminal) => (
          <div
            key={terminal.id}
            className={`absolute inset-0 ${activeTerminalId === terminal.id ? 'block' : 'hidden'}`}
          >
            <TerminalTab
              isVisible={isVisible && activeTerminalId === terminal.id}
              sandboxId={sandboxId}
              terminalId={terminal.id}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
