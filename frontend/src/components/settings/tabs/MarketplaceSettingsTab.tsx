import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/primitives/Input';
import { Spinner } from '@/components/ui/primitives/Spinner';
import { Store, Search, RefreshCw, AlertCircle } from 'lucide-react';
import {
  useMarketplaceCatalogQuery,
  useInstalledPluginsQuery,
  useRefreshCatalogMutation,
} from '@/hooks/queries/useMarketplaceQueries';
import { PluginCard } from './marketplace/PluginCard';
import { PluginDetailModal } from '../dialogs/PluginDetailModal';
import type { MarketplacePlugin } from '@/types/marketplace.types';

const CATEGORIES = [
  'all',
  'installed',
  'development',
  'productivity',
  'testing',
  'database',
  'deployment',
  'security',
  'design',
  'other',
] as const;

export const MarketplaceSettingsTab: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPlugin, setSelectedPlugin] = useState<MarketplacePlugin | null>(null);

  const { data: plugins = [], isLoading, isError, error } = useMarketplaceCatalogQuery();
  const { data: installedPlugins = [] } = useInstalledPluginsQuery();
  const refreshMutation = useRefreshCatalogMutation();

  const installedNames = useMemo(
    () => new Set(installedPlugins.map((p) => p.name)),
    [installedPlugins],
  );

  const filteredPlugins = useMemo(() => {
    return plugins.filter((plugin) => {
      const matchesSearch =
        !searchQuery ||
        plugin.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        plugin.description.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory =
        selectedCategory === 'all' ||
        (selectedCategory === 'installed' && installedNames.has(plugin.name)) ||
        plugin.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [plugins, searchQuery, selectedCategory, installedNames]);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-text-primary dark:text-text-dark-primary">
            Plugin Marketplace
          </h2>
          <button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-text-secondary hover:bg-surface-secondary hover:text-text-primary disabled:opacity-50 dark:text-text-dark-secondary dark:hover:bg-surface-dark-secondary dark:hover:text-text-dark-primary"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshMutation.isPending ? 'animate-spin' : ''}`}
            />
            Refresh
          </button>
        </div>

        <p className="mb-4 text-xs text-text-tertiary dark:text-text-dark-tertiary">
          Browse and install plugins from the official Claude Code marketplace. Plugins can include
          agents, commands, skills, and MCP servers.
        </p>

        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary dark:text-text-dark-tertiary" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search plugins..."
              className="pl-9"
            />
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 dark:border-border-dark dark:bg-surface-dark-secondary dark:text-text-dark-primary"
          >
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category === 'all'
                  ? 'All Categories'
                  : category === 'installed'
                    ? 'Installed'
                    : category.charAt(0).toUpperCase() + category.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : isError ? (
          <div className="rounded-lg border border-error-200 bg-error-50 p-6 text-center dark:border-error-800 dark:bg-error-900/20">
            <AlertCircle className="mx-auto mb-3 h-8 w-8 text-error-500 dark:text-error-400" />
            <p className="mb-2 text-sm font-medium text-error-700 dark:text-error-300">
              Failed to load marketplace
            </p>
            <p className="mb-4 text-xs text-error-600 dark:text-error-400">
              {error instanceof Error ? error.message : 'An error occurred while fetching plugins'}
            </p>
            <button
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-error-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-error-700 disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshMutation.isPending ? 'animate-spin' : ''}`}
              />
              Try Again
            </button>
          </div>
        ) : filteredPlugins.length === 0 ? (
          <div className="rounded-lg border border-border bg-white p-8 text-center dark:border-border-dark dark:bg-surface-dark-tertiary">
            <Store className="mx-auto mb-3 h-8 w-8 text-text-quaternary dark:text-text-dark-quaternary" />
            <p className="text-sm text-text-tertiary dark:text-text-dark-tertiary">
              {plugins.length === 0
                ? 'No plugins available'
                : selectedCategory === 'installed'
                  ? 'No plugins installed yet'
                  : 'No plugins match your search'}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPlugins.map((plugin) => (
              <PluginCard
                key={plugin.name}
                plugin={plugin}
                isInstalled={installedNames.has(plugin.name)}
                onClick={() => setSelectedPlugin(plugin)}
              />
            ))}
          </div>
        )}
      </div>

      <PluginDetailModal
        plugin={selectedPlugin}
        isOpen={!!selectedPlugin}
        onClose={() => setSelectedPlugin(null)}
      />
    </div>
  );
};
