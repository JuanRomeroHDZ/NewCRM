import React from 'react';
import { AlertTriangle, Key, Plus } from 'lucide-react';
import type { VaultCredentialItem } from '../../../types';
import { EmptyState } from '../../common/EmptyState';
import { SecretField } from '../../common/SecretField';
import { credentialCategoryClass, ScopeBadge } from './passwordViewHelpers';

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
      <div className="divide-y divide-obsidian-border border-y border-obsidian-border" role="status" aria-label="Cargando contraseñas y llaves">
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
      <div className="divide-y divide-obsidian-border border-y border-obsidian-border">
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
      <div className="space-y-3 px-4 py-8 text-center">
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
