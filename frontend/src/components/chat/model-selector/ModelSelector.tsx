import { memo, useMemo, useEffect } from 'react';
import { Bot, ChevronDown } from 'lucide-react';
import { Dropdown } from '@/components/ui';
import type { DropdownItemType } from '@/components/ui';
import { useAuthStore } from '@/store';
import { useSettingsQuery, useModelSelection } from '@/hooks/queries';
import type { UserSettings } from '@/types/user.types';
import type { Model, ModelProvider } from '@/types/chat.types';

const PROVIDER_KEY_MAP: Record<ModelProvider, keyof UserSettings> = {
  anthropic: 'claude_code_oauth_token',
  zai: 'z_ai_api_key',
  openrouter: 'openrouter_api_key',
};

const PROVIDER_DISPLAY_NAMES: Record<ModelProvider, string> = {
  anthropic: 'Anthropic',
  zai: 'Z.ai',
  openrouter: 'OpenRouter',
};

const groupModelsByProvider = (models: Model[]) => {
  const groups = new Map<ModelProvider, Model[]>();

  models.forEach((model) => {
    if (!groups.has(model.provider)) {
      groups.set(model.provider, []);
    }
    groups.get(model.provider)!.push(model);
  });

  return Array.from(groups.entries()).map(([provider, items]) => ({
    label: PROVIDER_DISPLAY_NAMES[provider] || provider,
    items,
  }));
};

export interface ModelSelectorProps {
  selectedModelId: string;
  onModelChange: (modelId: string) => void;
  dropdownPosition?: 'top' | 'bottom';
  disabled?: boolean;
}

export const ModelSelector = memo(function ModelSelector({
  selectedModelId,
  onModelChange,
  dropdownPosition = 'bottom',
  disabled = false,
}: ModelSelectorProps) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const { models, isLoading } = useModelSelection({ enabled: isAuthenticated });

  const { data: settings } = useSettingsQuery({
    enabled: isAuthenticated,
  });

  const availableModels = useMemo(() => {
    if (!settings) return models;

    const filtered = models.filter((model) => {
      const keyField = PROVIDER_KEY_MAP[model.provider];
      return keyField && settings[keyField];
    });

    return filtered.length > 0 ? filtered : models;
  }, [models, settings]);

  const groupedItems = useMemo(() => {
    const groups = groupModelsByProvider(availableModels);
    const items: DropdownItemType<Model>[] = [];

    groups.forEach((group) => {
      items.push({ type: 'header', label: group.label });
      group.items.forEach((model) => {
        items.push({ type: 'item', data: model });
      });
    });

    return items;
  }, [availableModels]);

  const selectedModel = availableModels.find((m) => m.model_id === selectedModelId);

  useEffect(() => {
    if (availableModels.length > 0 && !selectedModel) {
      onModelChange(availableModels[0].model_id);
    }
  }, [availableModels, selectedModel, onModelChange]);

  if (isLoading || models.length === 0) {
    return (
      <div className="flex items-center gap-1 rounded-lg border border-border/70 bg-surface px-2 py-1 shadow-sm dark:border-white/5 dark:bg-surface-dark-tertiary">
        <Bot className="h-3.5 w-3.5 text-text-quaternary" />
        <div className="hidden h-3.5 w-16 animate-pulse rounded bg-text-quaternary/20 sm:block" />
        <ChevronDown className="hidden h-3.5 w-3.5 text-text-quaternary sm:block" />
      </div>
    );
  }

  return (
    <Dropdown
      value={selectedModel || availableModels[0]}
      items={groupedItems}
      getItemKey={(model) => model.model_id}
      getItemLabel={(model) => model.name}
      onSelect={(model) => onModelChange(model.model_id)}
      leftIcon={Bot}
      width="w-48"
      dropdownPosition={dropdownPosition}
      disabled={disabled}
      compactOnMobile
      searchable
      searchPlaceholder="Search models..."
      renderItem={(model, isSelected) => (
        <span
          className={`truncate text-xs font-medium text-text-primary ${isSelected ? 'dark:text-text-dark-primary' : 'dark:text-text-dark-secondary'}`}
        >
          {model.name}
        </span>
      )}
    />
  );
});
