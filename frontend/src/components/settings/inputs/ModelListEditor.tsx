import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Input, Switch, Label } from '@/components/ui';
import type { CustomProviderModel } from '@/types';

interface ModelListEditorProps {
  models: CustomProviderModel[];
  onChange: (models: CustomProviderModel[]) => void;
}

const createEmptyModel = (): CustomProviderModel => ({
  model_id: '',
  name: '',
  enabled: true,
});

export const ModelListEditor: React.FC<ModelListEditorProps> = ({ models, onChange }) => {
  const [newModel, setNewModel] = useState<CustomProviderModel>(createEmptyModel());
  const [error, setError] = useState<string | null>(null);

  const handleAddModel = () => {
    if (!newModel.model_id.trim()) {
      setError('Model ID is required');
      return;
    }
    if (!newModel.name.trim()) {
      setError('Model name is required');
      return;
    }
    if (models.some((m) => m.model_id === newModel.model_id.trim())) {
      setError('A model with this ID already exists');
      return;
    }

    onChange([
      ...models,
      { ...newModel, model_id: newModel.model_id.trim(), name: newModel.name.trim() },
    ]);
    setNewModel(createEmptyModel());
    setError(null);
  };

  const handleRemoveModel = (modelId: string) => {
    onChange(models.filter((m) => m.model_id !== modelId));
  };

  const handleToggleModel = (modelId: string) => {
    onChange(models.map((m) => (m.model_id === modelId ? { ...m, enabled: !m.enabled } : m)));
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <Label className="text-sm text-text-primary dark:text-text-dark-primary">Models</Label>
      </div>
      <div className="space-y-2">
        {models.length === 0 && (
          <p className="text-xs italic text-text-tertiary dark:text-text-dark-tertiary">
            No models configured
          </p>
        )}
        {models.map((model) => (
          <div
            key={model.model_id}
            className="flex items-center gap-3 rounded-lg border border-border bg-surface-tertiary p-3 dark:border-border-dark dark:bg-surface-dark-tertiary"
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-text-primary dark:text-text-dark-primary">
                {model.name}
              </div>
              <div className="font-mono text-xs text-text-tertiary dark:text-text-dark-tertiary">
                {model.model_id}
              </div>
            </div>
            <Switch
              checked={model.enabled}
              onCheckedChange={() => handleToggleModel(model.model_id)}
              size="sm"
              aria-label={model.enabled ? 'Disable model' : 'Enable model'}
            />
            <Button
              type="button"
              onClick={() => handleRemoveModel(model.model_id)}
              variant="ghost"
              size="icon"
              className="h-8 w-8 flex-shrink-0 text-error-600 hover:text-error-700 dark:text-error-400"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}

        <div className="rounded-lg border border-dashed border-border p-3 dark:border-border-dark">
          <div className="mb-2 grid grid-cols-2 gap-2">
            <Input
              value={newModel.model_id}
              onChange={(e) => setNewModel((prev) => ({ ...prev, model_id: e.target.value }))}
              placeholder="Model ID (e.g., gpt-4)"
              className="font-mono text-xs"
            />
            <Input
              value={newModel.name}
              onChange={(e) => setNewModel((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Display Name"
              className="text-xs"
            />
          </div>
          {error && <p className="mb-2 text-xs text-error-600 dark:text-error-400">{error}</p>}
          <Button
            type="button"
            onClick={handleAddModel}
            variant="outline"
            size="sm"
            className="w-full"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Model
          </Button>
        </div>
      </div>
    </div>
  );
};
