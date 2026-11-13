import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FolderLock, Key } from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import type { EntityScope, SecureResource, VaultCredentialItem } from '../../types';
import { InfoTooltip } from '../common/InfoTooltip';
import { CredentialCollection } from './passwords/CredentialCollection';
import { SecureResourceCollection } from './passwords/SecureResourceCollection';
import { SecureResourceEditor } from './passwords/SecureResourceEditor';

type CollectionTab = 'passwords' | 'resources';

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
  const credentialGeneration = useRef(0);
  const resourceGeneration = useRef(0);

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
        setResourcesError(error instanceof Error ? error.message : 'No se pudieron cargar los recursos seguros.');
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
          <h2 className="text-lg font-semibold text-white">Contraseñas y recursos seguros</h2>
          <InfoTooltip title="Protección con contraseña de acceso" content="Desbloquea tu espacio para consultar contraseñas y notas privadas." />
        </div>
        <p className="mx-auto max-w-md text-sm text-obsidian-muted">Desbloquea la bóveda para consultar o guardar información privada.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={openUnlockModal} className="min-h-10 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">Desbloquear bóveda</button>
          <button type="button" onClick={openPasswordGen} className="min-h-10 rounded-lg border border-obsidian-border bg-obsidian-panel px-4 text-xs font-medium text-white hover:bg-obsidian-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">Generar contraseña</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-3 sm:p-5 lg:p-6">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {activeTab === 'passwords' ? <Key className="shrink-0 text-indigo-300" size={18} aria-hidden="true" /> : <FolderLock className="shrink-0 text-indigo-300" size={18} aria-hidden="true" />}
          <h2 className="truncate text-base font-semibold text-white">
            {activeTab === 'passwords' ? `Contraseñas y llaves (${filteredCredentials.length})` : `Recursos y notas (${filteredResources.length})`}
          </h2>
          <InfoTooltip
            title={activeTab === 'passwords' ? 'Contraseñas y llaves' : 'Recursos seguros'}
            content={activeTab === 'passwords' ? 'Consulta y copia credenciales protegidas.' : 'Guarda códigos, licencias y notas privadas.'}
          />
        </div>
        {activeTab === 'passwords' ? (
          <button type="button" onClick={openPasswordGen} className="min-h-10 rounded-lg border border-obsidian-border bg-obsidian-panel px-3 text-xs font-semibold text-white hover:bg-obsidian-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">Generar contraseña</button>
        ) : (
          <button type="button" onClick={openCreateResource} className="min-h-10 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">Nuevo recurso</button>
        )}
      </header>

      <div role="tablist" aria-label="Contenido seguro" className="flex min-w-0 gap-1 border-b border-obsidian-border">
        <button type="button" role="tab" id="passwords-tab" aria-controls="passwords-panel" aria-selected={activeTab === 'passwords'} onClick={() => selectTab('passwords')} className={`inline-flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 border-b-2 px-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 sm:flex-initial sm:gap-2 sm:px-3 ${activeTab === 'passwords' ? 'border-indigo-400 text-white' : 'border-transparent text-obsidian-muted hover:text-white'}`}>
          <Key size={14} className="shrink-0" aria-hidden="true" /><span className="truncate">Contraseñas</span><span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px]">{filteredCredentials.length}</span>
        </button>
        <button type="button" role="tab" id="resources-tab" aria-controls="resources-panel" aria-selected={activeTab === 'resources'} onClick={() => selectTab('resources')} className={`inline-flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 border-b-2 px-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 sm:flex-initial sm:gap-2 sm:px-3 ${activeTab === 'resources' ? 'border-indigo-400 text-white' : 'border-transparent text-obsidian-muted hover:text-white'}`}>
          <FolderLock size={14} className="shrink-0" aria-hidden="true" /><span className="truncate">Recursos y notas</span><span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px]">{filteredResources.length}</span>
        </button>
      </div>

      {activeTab === 'passwords' ? (
        <div id="passwords-panel" role="tabpanel" aria-labelledby="passwords-tab">
          <CredentialCollection
            credentials={credentials}
            filteredCredentials={filteredCredentials}
            loading={credentialsLoading}
            error={credentialsError}
            onRetry={loadCredentials}
            search={credentialSearch}
            onSearchChange={setCredentialSearch}
            categoryFilter={categoryFilter}
            onCategoryChange={setCategoryFilter}
            onOpenEmailModal={() => openEmailModal()}
            onOpenPlatformModal={() => openPlatformModal()}
            onOpenInspector={openCredentialInspector}
            onClearFilters={() => { setCredentialSearch(''); setCategoryFilter('all'); }}
          />
        </div>
      ) : (
        <div id="resources-panel" role="tabpanel" aria-labelledby="resources-tab">
          <SecureResourceCollection
            resources={resources}
            filteredResources={filteredResources}
            loading={resourcesLoading}
            error={resourcesError}
            onRetry={loadResources}
            search={resourceSearch}
            onSearchChange={setResourceSearch}
            typeFilter={resourceTypeFilter}
            onTypeChange={setResourceTypeFilter}
            revealedResourceIds={revealedResourceIds}
            onToggleReveal={toggleRevealResource}
            onCreate={openCreateResource}
            onEdit={openEditResource}
            onDelete={deleteResource}
            onClearFilters={() => { setResourceSearch(''); setResourceTypeFilter('all'); }}
          />
        </div>
      )}

      {isResourceEditorOpen && (
        <SecureResourceEditor
          resource={editingResource}
          defaultScope={defaultEntityScope as EntityScope}
          onClose={closeResourceEditor}
          onSaved={triggerDataReload}
        />
      )}
    </div>
  );
};
