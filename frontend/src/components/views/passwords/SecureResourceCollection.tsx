import React from 'react';
import { AlertTriangle, Edit3, Eye, EyeOff, FolderLock, Search, Trash2 } from 'lucide-react';
import type { SecureResource, SecureResourceType } from '../../../types';
import { CopyButton } from '../../common/CopyButton';
import { EmptyState } from '../../common/EmptyState';
import { INPUT_LIMITS } from '../../../lib/validation';
import { resourceTypeMeta, ScopeBadge } from './passwordViewHelpers';

const resourceTypes = [
  { id: 'all', label: 'Todos' },
  { id: 'env_file', label: 'Variables (.env)' },
  { id: 'ssh_key', label: 'Llaves SSH' },
  { id: 'backup_codes', label: 'Códigos de recuperación' },
  { id: 'software_license', label: 'Licencias' },
  { id: 'nota_segura', label: 'Notas privadas' },
];

interface SecureResourceCollectionProps {
  resources: SecureResource[];
  filteredResources: SecureResource[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  typeFilter: string;
  onTypeChange: (value: string) => void;
  revealedResourceIds: Set<string>;
  onToggleReveal: (id: string) => void;
  onEdit: (resource: SecureResource) => void;
  onDelete: (resource: SecureResource) => void;
  onClearFilters: () => void;
}

export const SecureResourceCollection: React.FC<SecureResourceCollectionProps> = ({
  resources,
  filteredResources,
  loading,
  error,
  onRetry,
  search,
  onSearchChange,
  typeFilter,
  onTypeChange,
  revealedResourceIds,
  onToggleReveal,
  onEdit,
  onDelete,
  onClearFilters,
}) => (
  <section aria-label="Recursos y notas" className="space-y-4">
    <div className="flex min-w-0 flex-wrap items-center gap-3 border-b border-obsidian-border pb-4">
      <label className="relative min-w-0 w-full flex-1 sm:min-w-[220px]">
        <span className="sr-only">Buscar por título, etiquetas o notas</span>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-obsidian-muted" aria-hidden="true" />
        <input
          type="search"
          maxLength={INPUT_LIMITS.SEARCH}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Buscar por título, etiquetas o notas"
          className="min-h-11 w-full rounded-lg border border-obsidian-border bg-obsidian-bg py-2 pl-9 pr-3 text-sm text-white placeholder-obsidian-muted/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent"
        />
      </label>
      <label className="w-full min-w-0 sm:hidden">
        <span className="sr-only">Filtrar recursos por tipo</span>
        <select
          value={typeFilter}
          onChange={(event) => onTypeChange(event.target.value)}
          className="min-h-11 w-full min-w-0 rounded-lg border border-obsidian-border bg-obsidian-bg px-3 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent"
        >
          {resourceTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
        </select>
      </label>
      {/* [Estado seleccionable] Cambia la categoría de recursos visible. */}
      <div className="hidden max-w-full flex-wrap items-center gap-1.5 sm:flex" role="group" aria-label="Filtrar recursos por tipo">
        {resourceTypes.map((type) => (
          <button
            key={type.id}
            type="button"
            aria-pressed={typeFilter === type.id}
            onClick={() => onTypeChange(type.id)}
            className="ui-action-toggle whitespace-nowrap"
          >
            {type.label}
          </button>
        ))}
      </div>
    </div>

    {loading && (
      <div className="divide-y divide-obsidian-border overflow-hidden rounded-xl border border-obsidian-border bg-obsidian-panel" role="status" aria-label="Cargando recursos">
        <div className="h-24 animate-pulse bg-obsidian-surface/50" />
        <div className="h-24 animate-pulse bg-obsidian-surface/50" />
        <div className="h-24 animate-pulse bg-obsidian-surface/50" />
      </div>
    )}

    {error && !loading && (
      <EmptyState icon={AlertTriangle} tone="error" title="No se pudieron cargar los recursos" description={error} actionLabel="Reintentar" onAction={onRetry} />
    )}

    {!loading && !error && filteredResources.length > 0 && (
      <div className="divide-y divide-obsidian-border overflow-hidden rounded-xl border border-obsidian-border bg-obsidian-panel">
        {filteredResources.map((resource) => {
          const meta = resourceTypeMeta(resource.resource_type as SecureResourceType);
          const Icon = meta.icon;
          const isRevealed = revealedResourceIds.has(resource.id);

          return (
            <article key={resource.id} className="grid min-w-0 gap-4 p-4 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)_auto] sm:items-center sm:gap-6">
              <div className="min-w-0">
                <div className="flex min-w-0 items-start gap-3">
                  <Icon size={18} className="mt-0.5 shrink-0 text-obsidian-muted" aria-hidden="true" />
                  <div className="min-w-0">
                    <h3 className="break-words text-sm font-semibold text-white">{resource.title}</h3>
                    <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
                      <span className={`rounded border px-2 py-0.5 text-xs font-medium ${meta.badgeClass}`}>{meta.label}</span>
                      <ScopeBadge scope={resource.scope} />
                    </div>
                    {resource.notes && <p className="mt-2 break-words text-xs leading-5 text-obsidian-muted">{resource.notes}</p>}
                  </div>
                </div>
              </div>

              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-obsidian-border pb-1.5 text-xs text-obsidian-muted">
                  <span>Contenido privado</span>
                  <div className="flex shrink-0 items-center gap-1">
                    {/* [Estado seleccionable] Revela u oculta el contenido privado. */}
                    <button
                      type="button"
                      onClick={() => onToggleReveal(resource.id)}
                      aria-label={isRevealed ? `Ocultar contenido de ${resource.title}` : `Revelar contenido de ${resource.title}`}
                      aria-pressed={isRevealed}
                      className="ui-action-toggle"
                    >
                      {isRevealed ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                      <span>{isRevealed ? 'Ocultar' : 'Revelar'}</span>
                    </button>
                    <CopyButton value={resource.content || ''} label={resource.title} size="sm" requireVaultPassword />
                  </div>
                </div>
                {isRevealed ? (
                  <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-all py-2 text-xs text-obsidian-text">{resource.content || 'Sin contenido guardado'}</pre>
                ) : (
                  <p className="truncate py-2 text-xs text-obsidian-muted" aria-label="Contenido oculto">{resource.content_masked || '••••••••••••'}</p>
                )}
                {resource.tags?.length > 0 && <div className="mt-1 flex min-w-0 flex-wrap gap-1">{resource.tags.map((tag, index) => <span key={`${resource.id}-${index}`} className="max-w-full truncate rounded border border-obsidian-border px-2 py-0.5 text-[10px] text-obsidian-muted">{tag.name}</span>)}</div>}
              </div>

              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs text-obsidian-muted sm:justify-end">
                <div className="min-w-0 sm:text-right">
                  <span className="block truncate">{resource.ownership_type === 'own' ? 'Uso propio' : resource.ownership_type === 'client' ? 'Vinculado a cliente' : 'Independiente'}</span>
                  <span className="block">{resource.updated_at ? new Date(resource.updated_at).toLocaleDateString() : 'Reciente'}</span>
                </div>
                {/* [Icono] Editar el recurso; la acción destructiva permanece separada. */}
                <button type="button" onClick={() => onEdit(resource)} aria-label={`Editar recurso ${resource.title}`} title="Editar recurso" className="ui-action-icon">
                  <Edit3 size={16} aria-hidden="true" />
                </button>
                {/* [Acción destructiva] Enviar el recurso a la papelera. */}
                <button type="button" onClick={() => onDelete(resource)} aria-label={`Enviar recurso ${resource.title} a la papelera`} title="Enviar a papelera" className="ui-action-icon ui-action-danger">
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    )}

    {filteredResources.length === 0 && !loading && !error && (
      <div className="space-y-3 rounded-xl border border-obsidian-border bg-obsidian-panel p-5 text-center sm:p-8">
        <FolderLock size={20} className="mx-auto text-obsidian-muted" aria-hidden="true" />
        {resources.length === 0 ? (
          <>
            <p className="text-sm font-semibold text-white">No hay recursos para mostrar</p>
            <p className="mx-auto max-w-md text-xs text-obsidian-muted">Guarda códigos de recuperación, licencias o notas privadas.</p>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-white">{search ? `Sin coincidencias para “${search}”` : 'No hay recursos en este filtro'}</p>
            <button type="button" onClick={onClearFilters} className="ui-action-secondary">
              Limpiar filtros
            </button>
          </div>
        )}
      </div>
    )}
  </section>
);
