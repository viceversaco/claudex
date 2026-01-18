import { memo, useMemo, useEffect } from 'react';
import { Bot, ChevronDown } from 'lucide-react';
import { Dropdown } from '@/components/ui';
import type { DropdownItemType } from '@/components/ui';
import { useAuthStore } from '@/store';
import { useModelSelection } from '@/hooks/queries';
import type { Model } from '@/types/chat.types';

const groupModelsByProvider = (models: Model[]) => {
  const groups = new Map<string, { name: string; models: Model[] }>();

  models.forEach((model) => {
    const key = model.provider_id;
    if (!groups.has(key)) {
      groups.set(key, { name: model.provider_name, models: [] });
    }
    groups.get(key)!.models.push(model);
  });

  return Array.from(groups.values()).map((group) => ({
    label: group.name,
    items: group.models,
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

  const groupedItems = useMemo(() => {
    const groups = groupModelsByProvider(models);
    const items: DropdownItemType<Model>[] = [];

    groups.forEach((group) => {
      items.push({ type: 'header', label: group.label });
      group.items.forEach((model) => {
        items.push({ type: 'item', data: model });
      });
    });

    return items;
  }, [models]);

  const selectedModel = models.find((m) => m.model_id === selectedModelId);

  useEffect(() => {
    if (models.length > 0 && !selectedModel) {
      onModelChange(models[0].model_id);
    }
  }, [models, selectedModel, onModelChange]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-1 rounded-lg border border-border/70 bg-surface-tertiary px-2 py-1 shadow-sm dark:border-white/10 dark:bg-surface-dark-tertiary">
        <Bot className="h-3.5 w-3.5 text-text-quaternary" />
        <div className="hidden h-3.5 w-16 animate-pulse rounded bg-text-quaternary/20 sm:block" />
        <ChevronDown className="hidden h-3.5 w-3.5 text-text-quaternary sm:block" />
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="flex items-center gap-1 rounded-lg border border-border/70 bg-surface-tertiary px-2 py-1 shadow-sm dark:border-white/10 dark:bg-surface-dark-tertiary">
        <Bot className="h-3.5 w-3.5 text-text-quaternary" />
        <span className="hidden text-xs text-text-quaternary sm:block">No models</span>
        <ChevronDown className="hidden h-3.5 w-3.5 text-text-quaternary sm:block" />
      </div>
    );
  }

  return (
    <Dropdown
      value={selectedModel || models[0]}
      items={groupedItems}
      getItemKey={(model) => model.model_id}
      getItemLabel={(model) => `${model.provider_name} - ${model.name}`}
      onSelect={(model) => onModelChange(model.model_id)}
      leftIcon={Bot}
      width="w-64"
      dropdownPosition={dropdownPosition}
      disabled={disabled}
      compactOnMobile
      searchable
      searchPlaceholder="Search models..."
      renderItem={(model, isSelected) => (
        <span
          className={`truncate text-xs font-medium text-text-primary ${isSelected ? 'dark:text-text-dark-primary' : 'dark:text-text-dark-secondary'}`}
        >
          {model.provider_name} - {model.name}
        </span>
      )}
    />
  );
});
