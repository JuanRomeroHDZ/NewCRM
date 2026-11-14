import React from 'react';
import { AlertTriangle, ChevronDown, Filter, Key, Plus, Search } from 'lucide-react';
import type { VaultCredentialItem } from '../../../types';
import { CopyButton } from '../../common/CopyButton';
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
          className="min-h-10 w-full rounded-lg border border-obsidian-border bg-obsidian-bg py-2 pl-8 pr-3 text-xs text-white placeholder-obsidian-muted/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
        />
      </label>

      <details className="group relative shrink-0">
        <summary
          aria-label={`Filtrar contraseñas por tipo. Selección: ${selectedCategory}`}
          className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-obsidian-border bg-obsidian-panel px-2.5 text-xs text-obsidian-text hover:bg-obsidian-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 [&::-webkit-details-marker]:hidden"
        >
          <Filter size={14} aria-hidden="true" />
          <span className="hidden max-w-24 truncate sm:inline">{selectedCategory}</span>
          <ChevronDown size={13} className="text-obsidian-muted transition-transform group-open:rotate-180" aria-hidden="true" />
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
              className={`min-h-10 rounded-lg px-3 text-left text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 ${
                categoryFilter === category.id
                  ? 'bg-indigo-600 text-white'
                  : 'text-obsidian-text hover:bg-obsidian-surface'
              }`}
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
      <div className="space-y-3" role="status" aria-label="Cargando contraseñas y llaves">
        <div className="h-20 rounded-xl border border-obsidian-border bg-obsidian-panel animate-pulse" />
        <div className="h-20 rounded-xl border border-obsidian-border bg-obsidian-panel animate-pulse" />
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredCredentials.map((item) => (
          <article key={item.id} className="min-w-0 space-y-3 rounded-xl border border-obsidian-border bg-obsidian-panel p-3 sm:p-4">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <button
                type="button"
                onClick={() => onOpenInspector(item)}
                className="group min-w-0 flex-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
              >
                <span className="block break-words text-sm font-semibold text-white group-hover:text-indigo-300">{item.name}</span>
                {item.parent_email && <span className="mt-0.5 block break-all text-[11px] text-obsidian-muted">{item.parent_email}</span>}
              </button>
              <CopyButton
                value={item.credential_plain || ''}
                label={item.name}
                size="md"
                onClickCustom={() => onRequestProtectedCopy(item.credential_plain || '')}
              />
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold uppercase ${credentialCategoryClass(item.type)}`}>
                {item.category}
              </span>
              <ScopeBadge scope={item.scope} />
              {item.entropy && (
                <span className="inline-flex min-w-0 items-center gap-1 rounded border border-obsidian-border bg-obsidian-bg px-2 py-0.5 text-[10px] font-medium">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.entropy.color }} />
                  <span className="truncate" style={{ color: item.entropy.color }}>{item.entropy.label} ({item.entropy.score})</span>
                </span>
              )}
            </div>

            {item.username && <p className="break-all text-[11px] text-obsidian-muted">Usuario: <span className="text-white">{item.username}</span></p>}
            <div className="border-t border-obsidian-border/60 pt-2">
              <SecretField
                value={item.credential_plain}
                masked={item.credential_masked}
                label={item.name}
                onCopyRequest={() => onRequestProtectedCopy(item.credential_plain || '')}
              />
            </div>
          </article>
        ))}
      </div>
    )}

    {!loading && !error && filteredCredentials.length > 0 && (
      <div className="hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-xs text-obsidian-text">
            <caption className="sr-only">Credenciales guardadas</caption>
            <thead className="border-b border-obsidian-border bg-obsidian-surface/60 text-[10px] font-semibold uppercase tracking-wider text-obsidian-muted">
              <tr>
                <th scope="col" className="px-3 py-3">Nombre / Servicio</th>
                <th scope="col" className="px-3 py-3">Categoría</th>
                <th scope="col" className="px-3 py-3">Ámbito</th>
                <th scope="col" className="px-3 py-3">Usuario</th>
                <th scope="col" className="px-3 py-3">Contraseña / Llave</th>
                <th scope="col" className="px-3 py-3">Seguridad</th>
                <th scope="col" className="px-3 py-3 text-right">Copiar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-obsidian-border">
              {filteredCredentials.map((item) => (
                <tr key={item.id} className="group transition-colors hover:bg-obsidian-surface/50">
                  <td className="max-w-[220px] px-3 py-3">
                    <button type="button" onClick={() => onOpenInspector(item)} aria-label={`Inspeccionar ${item.name}`} className="w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">
                      <span className="block truncate font-semibold text-white group-hover:text-indigo-300" title={item.name}>{item.name}</span>
                      {item.parent_email && <span className="block truncate text-[10px] text-obsidian-muted" title={item.parent_email}>{item.parent_email}</span>}
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold uppercase ${credentialCategoryClass(item.type)}`}>{item.category}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3"><ScopeBadge scope={item.scope} /></td>
                  <td className="max-w-[180px] truncate px-3 py-3 font-mono text-[11px] text-white" title={item.username || ''}>{item.username || '—'}</td>
                  <td className="px-3 py-3">
                    <SecretField
                      value={item.credential_plain}
                      masked={item.credential_masked}
                      label={item.name}
                      onCopyRequest={() => onRequestProtectedCopy(item.credential_plain || '')}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    {item.entropy ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color: item.entropy.color }}>
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.entropy.color }} />
                        {item.entropy.label} ({item.entropy.score})
                      </span>
                    ) : <span className="text-[11px] text-obsidian-muted">Sin evaluar</span>}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <CopyButton
                      value={item.credential_plain || ''}
                      label={item.name}
                      size="md"
                      onClickCustom={() => onRequestProtectedCopy(item.credential_plain || '')}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )}

    {filteredCredentials.length === 0 && !loading && !error && (
      <div className="space-y-3 rounded-xl border border-obsidian-border bg-obsidian-panel p-5 text-center sm:p-8">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400">
          <Key size={20} aria-hidden="true" />
        </div>
        {credentials.length === 0 ? (
          <>
            <p className="text-sm font-semibold text-white">No hay credenciales para mostrar</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={onOpenEmailModal} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">
                <Plus size={14} aria-hidden="true" />Agregar correo
              </button>
              <button type="button" onClick={onOpenPlatformModal} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 text-xs font-semibold text-white hover:bg-obsidian-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">
                <Plus size={14} aria-hidden="true" />Agregar servicio
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-white">{search ? `Sin coincidencias para “${search}”` : 'No hay credenciales en este filtro'}</p>
            <button type="button" onClick={onClearFilters} className="min-h-10 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 text-xs font-semibold text-white hover:bg-obsidian-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">
              Limpiar filtros
            </button>
          </div>
        )}
      </div>
    )}
  </section>
);
