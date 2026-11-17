import React from 'react';
import { AlertTriangle, ChevronDown, Filter, Key, Plus, Search } from 'lucide-react';
import type { VaultCredentialItem } from '../../../types';
import { EmptyState } from '../../common/EmptyState';
import { SecretField } from '../../common/SecretField';
import { INPUT_LIMITS } from '../../../lib/validation';
import { credentialCategoryClass, ScopeBadge } from './passwordViewHelpers';

const categories = [
  { id: 'all', label: 'Todas' },
  { id: 'email', label: 'Correos principales' },
  { id: 'platform', label: 'Cuentas y servicios' },
  { id: 'pin', label: 'PIN' },
  { id: 'api_key', label: 'Llaves API' },
];

interface CredentialFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  categoryFilter: string;
  onCategoryChange: (value: string) => void;
}

export const CredentialFilters: React.FC<CredentialFiltersProps> = ({
  search,
  onSearchChange,
  categoryFilter,
  onCategoryChange,
}) => {
  const selectedCategory = categories.find((category) => category.id === categoryFilter)?.label || 'Todas';

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">Buscar contraseñas por nombre, usuario o correo</span>
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-obsidian-muted" aria-hidden="true" />
        <input
          type="search"
          maxLength={INPUT_LIMITS.SEARCH}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Buscar contraseña"
              className="min-h-11 w-full rounded-lg border border-obsidian-border bg-obsidian-bg py-2 pl-8 pr-3 text-sm text-white placeholder-obsidian-muted/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent"
        />
      </label>

      {/* [Menú y selector] El filtro mantiene visible la categoría elegida. */}
      <details className="group relative shrink-0">
        <summary
          aria-label={`Filtrar contraseñas por tipo. Selección: ${selectedCategory}`}
          data-caret="manual"
          className="ui-action-secondary cursor-pointer list-none [&::-webkit-details-marker]:hidden"
        >
          <Filter size={16} aria-hidden="true" />
          <span className="hidden max-w-24 truncate sm:inline">{selectedCategory}</span>
          <ChevronDown size={16} className="text-obsidian-muted transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div role="group" aria-label="Filtrar contraseñas por tipo" className="absolute right-0 top-full z-30 mt-2 grid w-52 gap-1 rounded-xl border border-obsidian-border bg-obsidian-panel p-2 shadow-xl">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              aria-pressed={categoryFilter === category.id}
              onClick={(event) => {
                onCategoryChange(category.id);
                const details = event.currentTarget.closest('details');
                if (details) details.open = false;
              }}
              className="ui-action-toggle ui-menu-item"
            >
              {category.label}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
};

interface CredentialCollectionProps {
  credentials: VaultCredentialItem[];
  filteredCredentials: VaultCredentialItem[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  search: string;
  onOpenEmailModal: () => void;
  onOpenPlatformModal: () => void;
  onOpenInspector: (item: VaultCredentialItem) => void;
  onRequestProtectedCopy: (value: string) => Promise<string | null>;
  onClearFilters: () => void;
}

export const CredentialCollection: React.FC<CredentialCollectionProps> = ({
  credentials,
  filteredCredentials,
  loading,
  error,
  onRetry,
  search,
  onOpenEmailModal,
  onOpenPlatformModal,
  onOpenInspector,
  onRequestProtectedCopy,
  onClearFilters,
}) => (
  <section aria-label="Contraseñas y llaves" className="space-y-4">
    {loading && (
      <div className="divide-y divide-obsidian-border overflow-hidden rounded-xl border border-obsidian-border bg-obsidian-panel" role="status" aria-label="Cargando contraseñas y llaves">
        <div className="h-20 animate-pulse bg-obsidian-surface/50" />
        <div className="h-20 animate-pulse bg-obsidian-surface/50" />
      </div>
    )}

    {error && !loading && (
      <EmptyState
        icon={AlertTriangle}
        tone="error"
        title="No se pudieron cargar las credenciales"
        description={error}
        actionLabel="Reintentar"
        onAction={onRetry}
      />
    )}

    {!loading && !error && filteredCredentials.length > 0 && (
      <div className="divide-y divide-obsidian-border overflow-hidden rounded-xl border border-obsidian-border bg-obsidian-panel">
        {filteredCredentials.map((item) => (
          <article key={item.id} className="grid min-w-0 gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.8fr)] sm:items-center sm:gap-6 sm:p-4">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                {/* [Navegación] Abrir el detalle de la credencial. */}
                <button
                  type="button"
                  onClick={() => onOpenInspector(item)}
                  className="ui-nav-action min-w-0 text-sm font-semibold text-white"
                >
                  <span className="break-words">{item.name}</span>
                </button>
                <span className={`rounded border px-2 py-0.5 text-xs font-medium ${credentialCategoryClass(item.type)}`}>
                  {item.category}
                </span>
                <ScopeBadge scope={item.scope} />
              </div>
              <div className="mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs text-obsidian-muted">
                {item.parent_email && <span className="break-all">{item.parent_email}</span>}
                {item.username && <span className="break-all">Usuario: <span className="text-obsidian-text">{item.username}</span></span>}
                {item.entropy && (
                  <span className="inline-flex min-w-0 items-center gap-1 font-medium" style={{ color: item.entropy.color }}>
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.entropy.color }} />
                    <span className="truncate">{item.entropy.label} ({item.entropy.score})</span>
                  </span>
                )}
              </div>
            </div>
            <div className="min-w-0">
              <SecretField
                value={item.credential_plain}
                masked={item.credential_masked}
                label={item.name}
                onCopyRequest={() => onRequestProtectedCopy(item.credential_plain || '')}
                className="w-full"
              />
            </div>
          </article>
        ))}
      </div>
    )}

    {filteredCredentials.length === 0 && !loading && !error && (
      <div className="space-y-3 rounded-xl border border-obsidian-border bg-obsidian-panel p-5 text-center sm:p-8">
        <Key size={20} className="mx-auto text-obsidian-muted" aria-hidden="true" />
        {credentials.length === 0 ? (
          <>
            <p className="text-sm font-semibold text-white">No hay credenciales para mostrar</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={onOpenEmailModal} className="ui-action-primary">
                <Plus size={16} aria-hidden="true" />Agregar correo
              </button>
              <button type="button" onClick={onOpenPlatformModal} className="ui-action-secondary">
                <Plus size={16} aria-hidden="true" />Agregar servicio
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-white">{search ? `Sin coincidencias para “${search}”` : 'No hay credenciales en este filtro'}</p>
            <button type="button" onClick={onClearFilters} className="ui-action-secondary">
              Limpiar filtros
            </button>
          </div>
        )}
      </div>
    )}
  </section>
);
