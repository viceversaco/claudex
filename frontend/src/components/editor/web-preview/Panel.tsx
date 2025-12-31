import { memo, useState, useCallback, useMemo, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Smartphone, Monitor, ExternalLink, RotateCcw } from 'lucide-react';
import type { PortInfo } from '@/types';
import { Button, Select, Spinner } from '@/components/ui';

const backgroundClass = 'bg-surface-secondary dark:bg-surface-dark-secondary';
const buttonHoverClass =
  'text-text-tertiary hover:text-text-secondary dark:hover:text-text-dark-secondary';

interface DeviceButtonProps {
  active: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
}

const DeviceButton = ({ active, onClick, title, children }: DeviceButtonProps) => (
  <Button
    onClick={onClick}
    variant="unstyled"
    className={`rounded p-1 ${
      active ? 'bg-surface-active shadow-sm dark:bg-surface-dark-active' : 'text-text-tertiary'
    }`}
    title={title}
  >
    {children}
  </Button>
);

export interface PanelProps {
  previewUrl?: string;
  ports?: PortInfo[];
  selectedPort?: PortInfo | null;
  onPortChange?: (port: PortInfo) => void;
  onRefreshPorts?: () => void;
}

export const Panel = memo(function Panel({
  previewUrl,
  ports = [],
  selectedPort,
  onPortChange,
  onRefreshPorts,
}: PanelProps) {
  const [deviceView, setDeviceView] = useState<'desktop' | 'mobile'>('desktop');
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(previewUrl));
  const [reloadToken, setReloadToken] = useState(0);

  const iframeKey = useMemo(() => {
    if (!previewUrl) return 'no-preview';
    return `${previewUrl}-${reloadToken}`;
  }, [previewUrl, reloadToken]);

  const handlePreviewLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handlePreviewError = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleOpenInNewTab = useCallback(() => {
    if (previewUrl) {
      window.open(previewUrl, '_blank');
    }
  }, [previewUrl]);

  const handleReload = useCallback(() => {
    if (!previewUrl) return;
    setIsLoading(true);
    setReloadToken((token) => token + 1);
    onRefreshPorts?.();
  }, [previewUrl, onRefreshPorts]);

  useEffect(() => {
    if (previewUrl) {
      setIsLoading(true);
    } else {
      setIsLoading(false);
    }
  }, [previewUrl]);

  if (!previewUrl) {
    return (
      <div className={`flex flex-1 items-center justify-center ${backgroundClass}`}>
        <div className="text-center">
          <p className="text-xs text-text-tertiary">No preview available</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-1 flex-col ${backgroundClass}`}>
      <div className="flex items-center border-b border-border px-3 py-1.5 dark:border-white/10">
        <div className="flex flex-1 items-center space-x-3">
          {/* Reload button - First */}
          <Button
            onClick={handleReload}
            variant="unstyled"
            className={`p-1.5 ${buttonHoverClass} rounded`}
            title="Reload preview"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>

          {/* URL display */}
          <div className="flex-1 overflow-hidden">
            <p
              className="truncate text-xs text-text-secondary dark:text-text-dark-secondary"
              title={previewUrl}
            >
              {previewUrl}
            </p>
          </div>

          {/* Open in new tab button */}
          <Button
            onClick={handleOpenInNewTab}
            variant="unstyled"
            className={`p-1.5 ${buttonHoverClass} rounded`}
            title="Open in new tab"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>

          {/* Device selector */}
          <div className="flex items-center rounded-md bg-surface-secondary p-0.5 dark:bg-surface-dark-secondary">
            <DeviceButton
              active={deviceView === 'desktop'}
              onClick={() => setDeviceView('desktop')}
              title="Desktop view"
            >
              <Monitor className="h-3.5 w-3.5" />
            </DeviceButton>
            <DeviceButton
              active={deviceView === 'mobile'}
              onClick={() => setDeviceView('mobile')}
              title="Mobile view"
            >
              <Smartphone className="h-3.5 w-3.5" />
            </DeviceButton>
          </div>
        </div>

        {ports.length > 0 && (
          <div className="flex items-center space-x-1.5">
            <div className="mx-2 h-4 w-px bg-border-secondary dark:bg-border-dark-secondary" />
            <span className="text-xs text-text-tertiary">Port:</span>
            <Select
              value={selectedPort?.port?.toString() ?? ''}
              onChange={(e) => {
                const port = ports.find((p) => p.port === Number(e.target.value));
                if (port && onPortChange) onPortChange(port);
              }}
              className="h-7 border-border-secondary bg-surface-secondary text-xs dark:border-border-dark-secondary dark:bg-surface-dark-secondary"
            >
              {ports.map((port) => (
                <option key={port.port} value={port.port}>
                  {port.port}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>
      <div className="relative h-full w-full flex-1 overflow-hidden bg-surface-secondary dark:bg-surface-dark-secondary">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-black/50">
            <Spinner size="md" className="h-6 w-6 text-brand-500" />
          </div>
        )}
        <div
          className={`h-full w-full transition-all duration-300 ${
            deviceView === 'mobile'
              ? 'mx-auto max-w-sm border-x border-border dark:border-white/10'
              : ''
          }`}
        >
          <iframe
            key={iframeKey}
            src={previewUrl}
            className="h-full w-full border-0 bg-surface-secondary dark:bg-surface-dark-secondary"
            title="Code Preview"
            sandbox="allow-scripts allow-same-origin allow-forms"
            onLoad={handlePreviewLoad}
            onError={handlePreviewError}
          />
        </div>
      </div>
    </div>
  );
});
