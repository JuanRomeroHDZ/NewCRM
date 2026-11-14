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
    <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-obsidian-border bg-obsidian-panel p-3 sm:p-4">
      <label className="relative min-w-0 w-full flex-1 sm:min-w-[220px]">
        <span className="sr-only">Buscar por título, etiquetas o notas</span>
        <Search size={14} className="absolute left-3 top-2.5 text-obsidian-muted" aria-hidden="true" />
        <input
          type="search"
          maxLength={INPUT_LIMITS.SEARCH}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Buscar por título, etiquetas o notas"
          className="w-full rounded-lg border border-obsidian-border bg-obsidian-bg py-2 pl-8 pr-3 text-xs text-white placeholder-obsidian-muted/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
        />
      </label>
      <label className="w-full min-w-0 sm:hidden">
        <span className="sr-only">Filtrar recursos por tipo</span>
        <select
          value={typeFilter}
          onChange={(event) => onTypeChange(event.target.value)}
          className="min-h-10 w-full min-w-0 rounded-lg border border-obsidian-border bg-obsidian-bg px-3 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
        >
          {resourceTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
        </select>
      </label>
      <div className="hidden max-w-full flex-wrap items-center gap-1.5 sm:flex" role="group" aria-label="Filtrar recursos por tipo">
        {resourceTypes.map((type) => (
          <button
            key={type.id}
            type="button"
            aria-pressed={typeFilter === type.id}
            onClick={() => onTypeChange(type.id)}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 ${
              typeFilter === type.id
                ? 'bg-indigo-600 text-white'
                : 'border border-obsidian-border bg-obsidian-bg text-obsidian-muted hover:text-white'
            }`}
          >
            {type.label}
          </button>
        ))}
      </div>
    </div>

    {loading && (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Cargando recursos">
        <div className="h-44 rounded-xl border border-obsidian-border bg-obsidian-panel animate-pulse" />
        <div className="h-44 rounded-xl border border-obsidian-border bg-obsidian-panel animate-pulse" />
        <div className="h-44 rounded-xl border border-obsidian-border bg-obsidian-panel animate-pulse" />
      </div>
    )}

    {error && !loading && (
      <EmptyState icon={AlertTriangle} tone="error" title="No se pudieron cargar los recursos" description={error} actionLabel="Reintentar" onAction={onRetry} />
    )}

    {!loading && !error && filteredResources.length > 0 && (
      <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filteredResources.map((resource) => {
          const meta = resourceTypeMeta(resource.resource_type as SecureResourceType);
          const Icon = meta.icon;
          const isRevealed = revealedResourceIds.has(resource.id);

          return (
            <article key={resource.id} className="flex min-w-0 flex-col justify-between gap-3 rounded-xl border border-obsidian-border bg-obsidian-panel p-3 transition-colors hover:border-obsidian-borderLight sm:p-4">
              <div className="min-w-0 space-y-3">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-start gap-2.5">
                    <span className="shrink-0 rounded-lg border border-obsidian-border bg-obsidian-surface p-2 text-white">
                      <Icon size={16} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold text-white" title={resource.title}>{resource.title}</h3>
                      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold uppercase ${meta.badgeClass}`}>{meta.label}</span>
                        <ScopeBadge scope={resource.scope} />
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => onEdit(resource)} aria-label={`Editar recurso ${resource.title}`} title="Editar recurso" className="rounded-lg p-2 text-obsidian-muted hover:bg-obsidian-surface hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">
                      <Edit3 size={14} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => onDelete(resource)} aria-label={`Enviar recurso ${resource.title} a la papelera`} title="Enviar a papelera" className="rounded-lg p-2 text-obsidian-muted hover:bg-rose-500/10 hover:text-rose-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-300">
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="min-w-0 border-y border-obsidian-border/60 py-2">
                  <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2 text-[10px] text-obsidian-muted">
                    <span>Contenido privado</span>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onToggleReveal(resource.id)}
                        aria-label={isRevealed ? `Ocultar contenido de ${resource.title}` : `Revelar contenido de ${resource.title}`}
                        className="inline-flex min-h-8 items-center gap-1 rounded px-2 text-obsidian-muted hover:bg-obsidian-surface hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
                      >
                        {isRevealed ? <EyeOff size={12} aria-hidden="true" /> : <Eye size={12} aria-hidden="true" />}
                        <span>{isRevealed ? 'Ocultar' : 'Revelar'}</span>
                      </button>
                      <CopyButton value={resource.content || ''} label={resource.title} size="sm" />
                    </div>
                  </div>
                  {isRevealed ? (
                    <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-all py-1 text-[11px] text-indigo-100">{resource.content || 'Sin contenido guardado'}</pre>
                  ) : (
                    <p className="truncate py-1 text-[11px] text-obsidian-muted" aria-label="Contenido oculto">{resource.content_masked || '••••••••••••'}</p>
                  )}
                </div>

                {resource.notes && <p className="line-clamp-2 break-words text-[11px] text-obsidian-muted">{resource.notes}</p>}
                {resource.tags?.length > 0 && (
                  <div className="flex min-w-0 flex-wrap gap-1">
                    {resource.tags.map((tag, index) => <span key={`${resource.id}-${index}`} className="max-w-full truncate rounded border border-obsidian-border bg-obsidian-surface px-1.5 py-0.5 text-[10px] text-obsidian-muted">{tag.name}</span>)}
                  </div>
                )}
              </div>

              <div className="flex min-w-0 items-center justify-between gap-2 border-t border-obsidian-border/60 pt-2 text-[10px] text-obsidian-muted">
                <span className="truncate">{resource.ownership_type === 'own' ? 'Uso propio' : resource.ownership_type === 'client' ? 'Vinculado a cliente' : 'Independiente'}</span>
                <span className="shrink-0">{resource.updated_at ? new Date(resource.updated_at).toLocaleDateString() : 'Reciente'}</span>
              </div>
            </article>
          );
        })}
      </div>
    )}

    {filteredResources.length === 0 && !loading && !error && (
      <div className="space-y-3 rounded-xl border border-obsidian-border bg-obsidian-panel p-5 text-center sm:p-8">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400">
          <FolderLock size={20} aria-hidden="true" />
        </div>
        {resources.length === 0 ? (
          <>
            <p className="text-sm font-semibold text-white">No hay recursos para mostrar</p>
            <p className="mx-auto max-w-md text-xs text-obsidian-muted">Guarda códigos de recuperación, licencias o notas privadas.</p>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-white">{search ? `Sin coincidencias para “${search}”` : 'No hay recursos en este filtro'}</p>
            <button type="button" onClick={onClearFilters} className="min-h-10 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 text-xs font-semibold text-white hover:bg-obsidian-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">
              Limpiar filtros
            </button>
          </div>
        )}
      </div>
    )}
  </section>
);
