import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FolderLock, Key, Plus, Search } from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { INPUT_LIMITS } from '../../lib/validation';
import type { EntityScope, SecureResource, VaultCredentialItem } from '../../types';
import { InfoTooltip } from '../common/InfoTooltip';
import { CredentialCollection } from './passwords/CredentialCollection';
import { SecureResourceCollection } from './passwords/SecureResourceCollection';
import { SecureResourceEditor } from './passwords/SecureResourceEditor';
import { VaultPasswordConfirmModal } from '../common/VaultPasswordConfirmModal';

type CollectionTab = 'passwords' | 'resources';

const credentialTypes = [
  { id: 'all', label: 'Todos los tipos' },
  { id: 'email', label: 'Correos principales' },
  { id: 'platform', label: 'Cuentas y servicios' },
  { id: 'pin', label: 'PIN' },
  { id: 'api_key', label: 'Llaves API' },
];

const resourceTypes = [
  { id: 'all', label: 'Todos los tipos' },
  { id: 'env_file', label: 'Variables (.env)' },
  { id: 'ssh_key', label: 'Llaves SSH' },
  { id: 'backup_codes', label: 'Códigos de recuperación' },
  { id: 'software_license', label: 'Licencias' },
  { id: 'nota_segura', label: 'Notas privadas' },
];

interface PendingProtectedCopy {
  value: string;
  resolve: (value: string | null) => void;
}

export const PasswordsView: React.FC = () => {
  const {
    isUnlocked,
    openUnlockModal,
    openPasswordGen,
    openInspector,
    openEmailModal,
    openPlatformModal,
    dataVersion,
    triggerDataReload,
    matchesScope,
    defaultEntityScope,
    confirm,
    showToast,
  } = useVault();

  const [activeTab, setActiveTab] = useState<CollectionTab>('passwords');
  const [credentials, setCredentials] = useState<VaultCredentialItem[]>([]);
  const [credentialSearch, setCredentialSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [credentialsLoading, setCredentialsLoading] = useState(true);
  const [credentialsError, setCredentialsError] = useState<string | null>(null);
  const [resources, setResources] = useState<SecureResource[]>([]);
  const [resourceSearch, setResourceSearch] = useState('');
  const [resourceTypeFilter, setResourceTypeFilter] = useState('all');
  const [resourcesLoading, setResourcesLoading] = useState(true);
  const [resourcesError, setResourcesError] = useState<string | null>(null);
  const [revealedResourceIds, setRevealedResourceIds] = useState<Set<string>>(new Set());
  const [isResourceEditorOpen, setIsResourceEditorOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<SecureResource | null>(null);
  const [isCopyConfirmationOpen, setIsCopyConfirmationOpen] = useState(false);
  const pendingProtectedCopy = useRef<PendingProtectedCopy | null>(null);
  const credentialGeneration = useRef(0);
  const resourceGeneration = useRef(0);

  const requestProtectedCopy = useCallback((value: string) => new Promise<string | null>((resolve) => {
    if (!value) {
      resolve(null);
      return;
    }
    pendingProtectedCopy.current?.resolve(null);
    pendingProtectedCopy.current = { value, resolve };
    setIsCopyConfirmationOpen(true);
  }), []);

  const cancelProtectedCopy = useCallback(() => {
    pendingProtectedCopy.current?.resolve(null);
    pendingProtectedCopy.current = null;
    setIsCopyConfirmationOpen(false);
  }, []);

  const confirmProtectedCopy = useCallback(async (password: string) => {
    const result = await api.verifyVaultPassword(password);
    if (!result.verified) throw new Error('No se pudo verificar la contraseña.');
    const pending = pendingProtectedCopy.current;
    pendingProtectedCopy.current = null;
    setIsCopyConfirmationOpen(false);
    pending?.resolve(pending.value);
  }, []);

  useEffect(() => {
    if (!isUnlocked) cancelProtectedCopy();
  }, [cancelProtectedCopy, isUnlocked]);

  useEffect(() => () => {
    pendingProtectedCopy.current?.resolve(null);
    pendingProtectedCopy.current = null;
  }, []);

  const loadCredentials = useCallback(async () => {
    const generation = ++credentialGeneration.current;
    if (!isUnlocked) {
      setCredentials([]);
      setCredentialSearch('');
      setCategoryFilter('all');
      setCredentialsError(null);
      setCredentialsLoading(false);
      return;
    }

    setCredentialsLoading(true);
    setCredentialsError(null);
    try {
      const data = await api.getVaultCredentials();
      if (generation === credentialGeneration.current) setCredentials(data);
    } catch (error) {
      if (generation === credentialGeneration.current) {
        setCredentialsError(error instanceof Error ? error.message : 'No se pudieron cargar las credenciales.');
      }
    } finally {
      if (generation === credentialGeneration.current) setCredentialsLoading(false);
    }
  }, [isUnlocked]);

  const loadResources = useCallback(async () => {
    const generation = ++resourceGeneration.current;
    if (!isUnlocked) {
      setResources([]);
      setResourceSearch('');
      setResourceTypeFilter('all');
      setResourcesError(null);
      setRevealedResourceIds(new Set());
      setIsResourceEditorOpen(false);
      setEditingResource(null);
      setResourcesLoading(false);
      return;
    }

    setResourcesLoading(true);
    setResourcesError(null);
    try {
      const data = await api.getResources();
      if (generation === resourceGeneration.current) setResources(data);
    } catch (error) {
      if (generation === resourceGeneration.current) {
      setResourcesError(error instanceof Error ? error.message : 'No se pudieron cargar los recursos.');
      }
    } finally {
      if (generation === resourceGeneration.current) setResourcesLoading(false);
    }
  }, [isUnlocked]);

  useEffect(() => {
    void loadCredentials();
    return () => { credentialGeneration.current += 1; };
  }, [loadCredentials, dataVersion]);

  useEffect(() => {
    void loadResources();
    return () => { resourceGeneration.current += 1; };
  }, [loadResources, dataVersion]);

  const filteredCredentials = useMemo(() => credentials.filter((credential) => {
    if (!matchesScope(credential.scope)) return false;
    const query = credentialSearch.trim().toLocaleLowerCase();
    const matchesQuery = !query || [credential.name, credential.username, credential.parent_email]
      .some((value) => value?.toLocaleLowerCase().includes(query));
    if (!matchesQuery) return false;
    if (categoryFilter === 'email') return credential.type === 'email_password';
    if (categoryFilter === 'platform') return credential.type === 'platform_password';
    if (categoryFilter === 'pin') return credential.type === 'pin';
    if (categoryFilter === 'api_key') return credential.type === 'api_key';
    return true;
  }), [credentials, credentialSearch, categoryFilter, matchesScope]);

  const filteredResources = useMemo(() => resources.filter((resource) => {
    if (!matchesScope(resource.scope)) return false;
    const query = resourceSearch.trim().toLocaleLowerCase();
    const matchesQuery = !query || [resource.title, resource.notes, ...(resource.tags || []).map((tag) => tag.name)]
      .some((value) => value?.toLocaleLowerCase().includes(query));
    if (!matchesQuery) return false;
    return resourceTypeFilter === 'all' || resource.resource_type === resourceTypeFilter;
  }), [resources, resourceSearch, resourceTypeFilter, matchesScope]);

  const closeResourceEditor = useCallback(() => {
    setIsResourceEditorOpen(false);
    setEditingResource(null);
  }, []);

  const openCreateResource = useCallback(() => {
    if (!isUnlocked) {
      openUnlockModal();
      return;
    }
    setEditingResource(null);
    setIsResourceEditorOpen(true);
  }, [isUnlocked, openUnlockModal]);

  const openEditResource = useCallback((resource: SecureResource) => {
    if (!isUnlocked) {
      openUnlockModal();
      return;
    }
    setEditingResource(resource);
    setIsResourceEditorOpen(true);
  }, [isUnlocked, openUnlockModal]);

  const toggleRevealResource = useCallback((id: string) => {
    if (!isUnlocked) {
      openUnlockModal();
      return;
    }
    setRevealedResourceIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [isUnlocked, openUnlockModal]);

  const deleteResource = useCallback(async (resource: SecureResource) => {
    if (!isUnlocked) {
      openUnlockModal();
      return;
    }
    const accepted = await confirm({
      title: 'Enviar recurso a la papelera',
      message: `¿Enviar “${resource.title}” a la papelera? Podrás restaurarlo después.`,
      confirmLabel: 'Enviar a papelera',
      cancelLabel: 'Cancelar',
      tone: 'warning',
    });
    if (!accepted) return;
    try {
      await api.deleteResource(resource.id);
      showToast(`Recurso “${resource.title}” enviado a la papelera.`, 'info');
      triggerDataReload();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo eliminar el recurso.', 'error');
    }
  }, [confirm, isUnlocked, openUnlockModal, showToast, triggerDataReload]);

  const openCredentialInspector = useCallback((item: VaultCredentialItem) => {
    openInspector(item.type === 'email_password' ? 'email' : 'platform', item.entity_id);
  }, [openInspector]);

  const selectTab = (tab: CollectionTab) => {
    if (tab === 'passwords') setRevealedResourceIds(new Set());
    setActiveTab(tab);
  };

  if (!isUnlocked) {
    return (
      <div className="mx-auto max-w-2xl space-y-5 px-4 py-10 text-center sm:px-8 sm:py-16">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-300">
          <Key size={24} aria-hidden="true" />
        </div>
        <div className="flex items-center justify-center gap-2">
          <h2 className="text-lg font-semibold text-white">Contraseñas y recursos</h2>
          <InfoTooltip title="Acceso protegido" content="Desbloquea el espacio para consultar contraseñas y notas privadas." />
        </div>
        <p className="mx-auto max-w-md text-sm text-obsidian-muted">Desbloquea la bóveda para consultar o guardar información privada.</p>
        {/* [Acción principal] Abrir la bóveda; la generación es secundaria. */}
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={openUnlockModal} className="ui-action-primary">Desbloquear bóveda</button>
          <button type="button" onClick={openPasswordGen} className="ui-action-secondary">Generar contraseña</button>
        </div>
      </div>
    );
  }

  const isCredentials = activeTab === 'passwords';
  const searchLabel = isCredentials ? 'Buscar por nombre, usuario o correo' : 'Buscar por título, etiquetas o notas';
  const tabs = [
    { id: 'passwords', label: 'Claves', Icon: Key, count: filteredCredentials.length },
    { id: 'resources', label: 'Notas', Icon: FolderLock, count: filteredResources.length },
  ] as const;

  return (
    <div className="mx-auto w-full max-w-7xl p-3 sm:p-5 lg:p-6">
      {/* [Navegación] Las dos colecciones comparten la misma barra de herramientas. */}
      <div role="tablist" aria-label="Colecciones" className="flex min-w-0 gap-1 border-b border-obsidian-border"
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const nextTab = event.key === 'Home' ? 'passwords' : event.key === 'End' ? 'resources'
            : isCredentials ? 'resources' : 'passwords';
          selectTab(nextTab);
          event.currentTarget.querySelector<HTMLButtonElement>(`#${nextTab}-tab`)?.focus();
        }}>
        {tabs.map(({ id, label, Icon, count }) => (
          <button key={id} type="button" role="tab" id={`${id}-tab`} aria-controls={`${id}-panel`}
            aria-selected={activeTab === id} tabIndex={activeTab === id ? 0 : -1}
            onClick={() => selectTab(id)} className="ui-action-toggle min-w-0 flex-1 sm:flex-initial">
            <Icon size={16} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{label}</span>
            <span className="shrink-0 rounded bg-obsidian-surface px-1.5 py-0.5 font-mono text-xs tabular-nums">{count}</span>
          </button>
        ))}
      </div>

      <div id={`${activeTab}-panel`} role="tabpanel" aria-labelledby={`${activeTab}-tab`} className="space-y-4 py-4">
        <div className="grid min-w-0 grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)_11rem]">
          <label className="relative min-w-0">
            <span className="sr-only">{searchLabel}</span>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-obsidian-muted" aria-hidden="true" />
            <input type="search" maxLength={INPUT_LIMITS.SEARCH} placeholder={searchLabel}
              value={isCredentials ? credentialSearch : resourceSearch}
              onChange={(event) => (isCredentials ? setCredentialSearch : setResourceSearch)(event.target.value)}
              className="min-h-11 w-full rounded-lg border border-obsidian-border bg-obsidian-surface py-2 pl-9 pr-3 text-sm text-white" />
          </label>
          <select aria-label={isCredentials ? 'Filtrar claves por tipo' : 'Filtrar notas por tipo'}
            value={isCredentials ? categoryFilter : resourceTypeFilter}
            onChange={(event) => (isCredentials ? setCategoryFilter : setResourceTypeFilter)(event.target.value)}
            className="min-h-11 w-full min-w-0 truncate text-sm">
            {(isCredentials ? credentialTypes : resourceTypes).map(({ id, label }) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
          {/* [Acción de colección] Generar una contraseña o crear un recurso. */}
          <button type="button" onClick={isCredentials ? openPasswordGen : openCreateResource}
            className={isCredentials ? 'ui-action-secondary' : 'ui-action-primary'}>
            {!isCredentials && <Plus size={16} aria-hidden="true" />}
            {isCredentials ? 'Generar contraseña' : 'Nuevo recurso'}
          </button>
        </div>

        {isCredentials ? (
          <CredentialCollection
            credentials={credentials}
            filteredCredentials={filteredCredentials}
            loading={credentialsLoading}
            error={credentialsError}
            onRetry={loadCredentials}
            search={credentialSearch}
            onOpenEmailModal={() => openEmailModal()}
            onOpenPlatformModal={() => openPlatformModal()}
            onOpenInspector={openCredentialInspector}
            onRequestProtectedCopy={requestProtectedCopy}
            onClearFilters={() => { setCredentialSearch(''); setCategoryFilter('all'); }}
          />
        ) : (
          <SecureResourceCollection
            resources={resources}
            filteredResources={filteredResources}
            loading={resourcesLoading}
            error={resourcesError}
            onRetry={loadResources}
            search={resourceSearch}
            revealedResourceIds={revealedResourceIds}
            onToggleReveal={toggleRevealResource}
            onEdit={openEditResource}
            onDelete={deleteResource}
            onClearFilters={() => { setResourceSearch(''); setResourceTypeFilter('all'); }}
          />
        )}
      </div>
      <div id={isCredentials ? 'resources-panel' : 'passwords-panel'} role="tabpanel"
        aria-labelledby={isCredentials ? 'resources-tab' : 'passwords-tab'} hidden />

      {isResourceEditorOpen && (
        <SecureResourceEditor
          resource={editingResource}
          defaultScope={defaultEntityScope as EntityScope}
          onClose={closeResourceEditor}
          onSaved={triggerDataReload}
        />
      )}

      {isCopyConfirmationOpen && (
        <VaultPasswordConfirmModal
          onCancel={cancelProtectedCopy}
          onConfirm={confirmProtectedCopy}
        />
      )}
    </div>
  );
};
