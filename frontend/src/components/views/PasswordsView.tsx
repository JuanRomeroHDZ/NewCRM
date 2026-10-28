import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Key, Search, Lock, Sparkles, Plus, FileCode, Terminal, 
  KeyRound, ShieldCheck, FileText, Tag, Edit3, Trash2, Eye, EyeOff, 
  FolderLock, Check, Briefcase, User, Users, X, Info
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { 
  VaultCredentialItem, SecureResource, SecureResourceType, 
  EntityScope, OwnershipType, TagItem 
} from '../../types';
import { CopyButton } from '../common/CopyButton';
import { SecretField } from '../common/SecretField';
import { InfoTooltip } from '../common/InfoTooltip';
import { INPUT_LIMITS } from '../../lib/validation';

export const PasswordsView: React.FC = () => {
  const { 
    isUnlocked, openUnlockModal, openPasswordGen, 
    openInspector, openEmailModal, openPlatformModal, dataVersion,
    triggerDataReload, showToast, activeScope, matchesScope, defaultEntityScope 
  } = useVault();

  // Active view tab
  const [activeTab, setActiveTab] = useState<'passwords' | 'resources'>('passwords');

  // Credentials State
  const [credentials, setCredentials] = useState<VaultCredentialItem[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [loadingCreds, setLoadingCreds] = useState(true);

  // Secure Resources State
  const [resources, setResources] = useState<SecureResource[]>([]);
  const [resSearch, setResSearch] = useState('');
  const [resTypeFilter, setResTypeFilter] = useState('all');
  const [loadingResources, setLoadingResources] = useState(true);
  const [revealedResourceIds, setRevealedResourceIds] = useState<Set<string>>(new Set());

  // Resource Modal State
  const [isResourceModalOpen, setIsResourceModalOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<SecureResource | null>(null);
  const [resTitle, setResTitle] = useState('');
  const [resType, setResType] = useState<SecureResourceType>('env_file');
  const [resScope, setResScope] = useState<EntityScope>(defaultEntityScope);
  const [resOwnership, setResOwnership] = useState<OwnershipType>('own');
  const [resContent, setResContent] = useState('');
  const [resTags, setResTags] = useState('');
  const [resNotes, setResNotes] = useState('');
  const [savingResource, setSavingResource] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);

  // Load Credentials
  useEffect(() => {
    if (!isUnlocked) {
      setLoadingCreds(false);
      return;
    }
    setLoadingCreds(true);
    api.getVaultCredentials()
      .then(setCredentials)
      .catch(console.error)
      .finally(() => setLoadingCreds(false));
  }, [isUnlocked, dataVersion]);

  // Load Resources
  useEffect(() => {
    if (!isUnlocked) {
      setLoadingResources(false);
      return;
    }
    setLoadingResources(true);
    api.getResources()
      .then(setResources)
      .catch(console.error)
      .finally(() => setLoadingResources(false));
  }, [isUnlocked, dataVersion]);

  // ESC Listener for Resource Modal
  useEffect(() => {
    if (!isResourceModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsResourceModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isResourceModalOpen]);

  // Focus title input when modal opens
  useEffect(() => {
    if (isResourceModalOpen) {
      setTimeout(() => titleInputRef.current?.focus(), 50);
    }
  }, [isResourceModalOpen]);

  const toggleRevealResource = (id: string) => {
    setRevealedResourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleOpenCreateResourceModal = () => {
    if (!isUnlocked) {
      openUnlockModal();
      return;
    }
    setEditingResource(null);
    setResTitle('');
    setResType('env_file');
    setResScope(defaultEntityScope);
    setResOwnership('own');
    setResContent('');
    setResTags('');
    setResNotes('');
    setIsResourceModalOpen(true);
  };

  const handleOpenEditResourceModal = (item: SecureResource) => {
    if (!isUnlocked) {
      openUnlockModal();
      return;
    }
    setEditingResource(item);
    setResTitle(item.title);
    setResType(item.resource_type);
    setResScope(item.scope);
    setResOwnership(item.ownership_type);
    setResContent(item.content || '');
    setResTags((item.tags || []).map((t) => t.name).join(', '));
    setResNotes(item.notes || '');
    setIsResourceModalOpen(true);
  };

  const handleSaveResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resTitle.trim()) {
      showToast('Ingresa un título para el recurso seguro.', 'error');
      return;
    }

    setSavingResource(true);
    try {
      const parsedTags: TagItem[] = resTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => ({ name: t, color: '#6366f1' }));

      const payload: Partial<SecureResource> = {
        title: resTitle.trim(),
        resource_type: resType,
        scope: resScope,
        ownership_type: resOwnership,
        content: resContent,
        tags: parsedTags,
        notes: resNotes.trim() || undefined,
      };

      if (editingResource) {
        await api.updateResource(editingResource.id, payload);
        showToast(`Recurso "${resTitle}" actualizado exitosamente.`, 'success');
      } else {
        await api.createResource(payload);
        showToast(`Recurso "${resTitle}" guardado en la bóveda cifrada.`, 'success');
      }

      setIsResourceModalOpen(false);
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message || 'Error al guardar recurso seguro', 'error');
    } finally {
      setSavingResource(false);
    }
  };

  const handleDeleteResource = async (id: string, title: string) => {
    if (!isUnlocked) {
      openUnlockModal();
      return;
    }
    if (!window.confirm(`¿Enviar el recurso "${title}" a la papelera?`)) return;

    try {
      await api.deleteResource(id);
      showToast(`Recurso "${title}" enviado a la papelera.`, 'info');
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message || 'Error al eliminar recurso', 'error');
    }
  };

  // Filtered credentials by scope, category and search
  const filteredCredentials = useMemo(() => {
    return credentials.filter((c) => {
      if (!matchesScope(c.scope)) return false;

      const matchQ =
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.username && c.username.toLowerCase().includes(search.toLowerCase())) ||
        (c.parent_email && c.parent_email.toLowerCase().includes(search.toLowerCase()));

      if (categoryFilter === 'all') return matchQ;
      if (categoryFilter === 'email') return matchQ && c.type === 'email_password';
      if (categoryFilter === 'platform') return matchQ && c.type === 'platform_password';
      if (categoryFilter === 'pin') return matchQ && c.type === 'pin';
      if (categoryFilter === 'api_key') return matchQ && c.type === 'api_key';
      return matchQ;
    });
  }, [credentials, search, categoryFilter, matchesScope]);

  // Filtered resources by scope, type and search
  const filteredResources = useMemo(() => {
    return resources.filter((r) => {
      if (!matchesScope(r.scope)) return false;

      const matchQ =
        r.title.toLowerCase().includes(resSearch.toLowerCase()) ||
        (r.notes && r.notes.toLowerCase().includes(resSearch.toLowerCase())) ||
        (r.tags && r.tags.some((t) => t.name.toLowerCase().includes(resSearch.toLowerCase())));

      if (!matchQ) return false;
      if (resTypeFilter === 'all') return true;
      return r.resource_type === resTypeFilter;
    });
  }, [resources, resSearch, resTypeFilter, matchesScope]);

  const getResourceTypeMeta = (type: string) => {
    switch (type) {
      case 'env_file':
        return {
          label: 'Archivo .env',
          icon: FileCode,
          badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        };
      case 'ssh_key':
        return {
          label: 'Llave SSH / Certificado',
          icon: Terminal,
          badgeClass: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
        };
      case 'backup_codes':
        return {
          label: 'Códigos 2FA / Backup',
          icon: KeyRound,
          badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        };
      case 'software_license':
        return {
          label: 'Licencia de Software',
          icon: ShieldCheck,
          badgeClass: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
        };
      case 'nota_segura':
      default:
        return {
          label: 'Nota Segura Privada',
          icon: FileText,
          badgeClass: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
        };
    }
  };

  const getScopeBadge = (scope?: EntityScope) => {
    if (scope === 'personal') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <User size={10} />
          <span>Personal</span>
        </span>
      );
    }
    if (scope === 'shared') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
          <Users size={10} />
          <span>Compartido</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
        <Briefcase size={10} />
        <span>Empresa</span>
      </span>
    );
  };

  if (!isUnlocked) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center space-y-6 pt-24 animate-fadeIn">
        <div className="w-16 h-16 mx-auto rounded-3xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 shadow-xl shadow-amber-500/10">
          <Lock size={32} />
        </div>
        <div className="flex items-center justify-center gap-2">
          <h2 className="text-xl font-bold text-white tracking-tight">
            Contraseñas, Llaves y Recursos Protegidos
          </h2>
          <InfoTooltip
            title="Protección con Contraseña Maestra"
            content="Tus contraseñas, PINs, llaves SSH, archivos .env y notas privadas están encriptados con AES-256-GCM y requieren tu contraseña maestra para mostrarse."
          />
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={openUnlockModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
          >
            <Key size={15} />
            <span>Desbloquear con Contraseña Maestra</span>
          </button>
          <button
            type="button"
            onClick={openPasswordGen}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-obsidian-panel hover:bg-obsidian-surface border border-obsidian-border text-white text-xs font-medium transition-colors"
          >
            <Sparkles size={14} className="text-cyan-400" />
            <span>Generar Contraseña</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 animate-fadeIn">
      {/* Top Header & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          {activeTab === 'passwords' ? (
            <Key className="text-indigo-400 flex-shrink-0" size={18} />
          ) : (
            <FolderLock className="text-cyan-400 flex-shrink-0" size={18} />
          )}
          <h2 className="text-base font-bold text-white tracking-tight truncate">
            {activeTab === 'passwords'
              ? `Contraseñas, PINs y Llaves (${filteredCredentials.length})`
              : `Recursos Libres y Notas Seguras (${filteredResources.length})`}
          </h2>
          <InfoTooltip
            title={activeTab === 'passwords' ? 'Seguridad de Contraseñas' : 'Bóveda de Recursos Cifrados'}
            content={
              activeTab === 'passwords'
                ? 'Todas tus contraseñas se mantienen encriptadas y el portapapeles se borra automáticamente después de copiar.'
                : 'Bóveda cifrada con AES-256-GCM para variables de entorno (.env), llaves SSH, códigos de recuperación 2FA, seriales y notas estructuradas sin ataduras de usuario.'
            }
          />
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {activeTab === 'passwords' ? (
            <button
              type="button"
              onClick={openPasswordGen}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-obsidian-surface hover:bg-obsidian-border border border-obsidian-border text-white text-xs font-semibold transition-all flex-shrink-0"
            >
              <Sparkles size={14} className="text-cyan-400" />
              <span>Generar Contraseña</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOpenCreateResourceModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all flex-shrink-0"
            >
              <Plus size={14} />
              <span>Nuevo Recurso Seguro</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Tab Switcher */}
      <div className="flex items-center gap-2 border-b border-obsidian-border pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('passwords')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'passwords'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'bg-obsidian-panel border border-obsidian-border text-obsidian-muted hover:text-white hover:bg-obsidian-surface'
          }`}
        >
          <Key size={14} />
          <span>Contraseñas y Llaves</span>
          <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-md bg-white/10">
            {filteredCredentials.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('resources')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'resources'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'bg-obsidian-panel border border-obsidian-border text-obsidian-muted hover:text-white hover:bg-obsidian-surface'
          }`}
        >
          <FolderLock size={14} />
          <span>Recursos Libres y Notas Seguras</span>
          <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-md bg-white/10">
            {filteredResources.length}
          </span>
        </button>
      </div>

      {/* TAB 1: PASSWORDS & APIS */}
      {activeTab === 'passwords' && (
        <div className="space-y-6">
          {/* Filter toolbar */}
          <div className="p-4 rounded-2xl bg-obsidian-panel border border-obsidian-border flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="relative flex-1 min-w-[220px]">
              <Search size={14} className="absolute left-3 top-2.5 text-obsidian-muted" />
              <input
                type="text"
                maxLength={INPUT_LIMITS.SEARCH}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar contraseña por nombre, usuario o correo..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-xs text-white placeholder-obsidian-muted/60 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Category Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {[
                { id: 'all', label: 'Todas' },
                { id: 'email', label: 'Correos Principales' },
                { id: 'platform', label: 'Cuentas y Servicios' },
                { id: 'pin', label: 'PINs' },
                { id: 'api_key', label: 'Llaves API' },
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    categoryFilter === cat.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-obsidian-bg border border-obsidian-border text-obsidian-muted hover:text-white'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Credentials Table */}
          {filteredCredentials.length > 0 && (
            <div className="rounded-2xl bg-obsidian-panel border border-obsidian-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-left text-xs text-obsidian-text">
                  <thead className="bg-obsidian-surface/60 border-b border-obsidian-border text-obsidian-muted font-semibold uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Nombre / Servicio</th>
                      <th className="py-3 px-4">Categoría</th>
                      <th className="py-3 px-4">Ámbito</th>
                      <th className="py-3 px-4">Usuario</th>
                      <th className="py-3 px-4">Contraseña / Llave</th>
                      <th className="py-3 px-4">Nivel de Seguridad</th>
                      <th className="py-3 px-4 text-right">Copiar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-obsidian-border">
                    {filteredCredentials.map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => {
                          if (item.type === 'email_password') {
                            openInspector('email', item.entity_id);
                          } else {
                            openInspector('platform', item.entity_id);
                          }
                        }}
                        className="hover:bg-obsidian-surface/50 transition-colors cursor-pointer group"
                      >
                        <td className="py-3.5 px-4 max-w-[220px]">
                          <div
                            className="font-semibold text-white group-hover:text-indigo-300 transition-colors truncate"
                            title={item.name}
                          >
                            {item.name}
                          </div>
                          {item.parent_email && (
                            <div
                              className="text-[10px] text-obsidian-muted font-mono truncate"
                              title={item.parent_email}
                            >
                              {item.parent_email}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                              item.type === 'api_key'
                                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                                : item.type === 'pin'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : item.type === 'email_password'
                                ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                            }`}
                          >
                            {item.category}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {getScopeBadge(item.scope)}
                        </td>

                        <td
                          className="py-3.5 px-4 font-mono text-[11px] text-white max-w-[180px] truncate"
                          title={item.username || ''}
                        >
                          {item.username || '—'}
                        </td>

                        <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                          <SecretField
                            value={item.credential_plain}
                            masked={item.credential_masked}
                            label={item.name}
                          />
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {item.entropy ? (
                            <div className="flex items-center gap-1.5">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: item.entropy.color }}
                              />
                              <span
                                className="font-medium text-[11px]"
                                style={{ color: item.entropy.color }}
                              >
                                {item.entropy.label} ({item.entropy.score})
                              </span>
                            </div>
                          ) : (
                            <span className="text-obsidian-muted text-[11px]">N/A</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <CopyButton
                            value={item.credential_plain || ''}
                            label={item.name}
                            size="md"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {filteredCredentials.length === 0 && !loadingCreds && (
            <div className="p-12 rounded-2xl bg-obsidian-panel border border-obsidian-border text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mx-auto">
                <Key size={22} />
              </div>
              {credentials.length === 0 ? (
                <>
                  <div className="text-sm font-bold text-white">
                    No hay contraseñas ni llaves registradas en este ámbito
                  </div>
                  <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => openEmailModal()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all"
                    >
                      <Plus size={14} />
                      <span>Agregar Correo Principal</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openPlatformModal()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-obsidian-surface hover:bg-obsidian-border border border-obsidian-border text-white text-xs font-semibold transition-all"
                    >
                      <Plus size={14} className="text-cyan-400" />
                      <span>Nueva Cuenta o Servicio</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-sm font-bold text-white">Sin coincidencias para "{search}"</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SECURE RESOURCES & ENCRYPTED NOTES */}
      {activeTab === 'resources' && (
        <div className="space-y-6">
          {/* Filter Toolbar */}
          <div className="p-4 rounded-2xl bg-obsidian-panel border border-obsidian-border flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="relative flex-1 min-w-[220px]">
              <Search size={14} className="absolute left-3 top-2.5 text-obsidian-muted" />
              <input
                type="text"
                maxLength={INPUT_LIMITS.SEARCH}
                value={resSearch}
                onChange={(e) => setResSearch(e.target.value)}
                placeholder="Buscar por título, etiquetas o notas..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-xs text-white placeholder-obsidian-muted/60 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Type Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {[
                { id: 'all', label: 'Todos' },
                { id: 'env_file', label: 'Variables (.env)' },
                { id: 'ssh_key', label: 'Llaves SSH' },
                { id: 'backup_codes', label: 'Códigos 2FA' },
                { id: 'software_license', label: 'Licencias' },
                { id: 'nota_segura', label: 'Notas Privadas' },
              ].map((tf) => (
                <button
                  key={tf.id}
                  onClick={() => setResTypeFilter(tf.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    resTypeFilter === tf.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-obsidian-bg border border-obsidian-border text-obsidian-muted hover:text-white'
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          </div>

          {/* Resources Grid */}
          {filteredResources.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredResources.map((res) => {
                const meta = getResourceTypeMeta(res.resource_type);
                const IconComp = meta.icon;
                const isRevealed = revealedResourceIds.has(res.id);

                return (
                  <div
                    key={res.id}
                    className="p-4 rounded-2xl bg-obsidian-panel border border-obsidian-border hover:border-obsidian-borderLight transition-all flex flex-col justify-between space-y-3 hover:shadow-xl min-w-0"
                  >
                    {/* Top Row: Icon, Title & Badges */}
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="p-2 rounded-xl bg-obsidian-surface border border-obsidian-border text-white flex-shrink-0">
                            <IconComp size={16} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3
                              className="font-bold text-white text-sm truncate"
                              title={res.title}
                            >
                              {res.title}
                            </h3>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase border ${meta.badgeClass}`}
                              >
                                {meta.label}
                              </span>
                              {getScopeBadge(res.scope)}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenEditResourceModal(res)}
                            className="p-1.5 rounded-lg bg-obsidian-surface hover:bg-obsidian-border text-obsidian-muted hover:text-white transition-colors"
                            title="Editar recurso"
                          >
                            <Edit3 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteResource(res.id, res.title)}
                            className="p-1.5 rounded-lg bg-obsidian-surface hover:bg-rose-500/20 text-obsidian-muted hover:text-rose-400 transition-colors"
                            title="Enviar a papelera"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Content Container (Encrypted AES-256-GCM) */}
                      <div className="p-3 rounded-xl bg-obsidian-bg border border-obsidian-border relative group">
                        <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-obsidian-border/50 text-[10px] text-obsidian-muted font-mono">
                          <span>Contenido Encriptado</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => toggleRevealResource(res.id)}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-obsidian-surface hover:bg-obsidian-border text-[10px] text-obsidian-muted hover:text-white transition-colors"
                              title={isRevealed ? 'Ocultar contenido' : 'Mostrar contenido'}
                            >
                              {isRevealed ? <EyeOff size={11} /> : <Eye size={11} />}
                              <span>{isRevealed ? 'Ocultar' : 'Revelar'}</span>
                            </button>
                            <CopyButton
                              value={res.content || ''}
                              label={res.title}
                              size="sm"
                            />
                          </div>
                        </div>

                        {isRevealed ? (
                          <pre className="text-[11px] font-mono text-indigo-200/90 whitespace-pre-wrap break-all max-h-40 overflow-y-auto select-all p-1">
                            {res.content || 'Sin contenido guardado'}
                          </pre>
                        ) : (
                          <div className="text-[11px] font-mono text-obsidian-muted select-none py-1 truncate">
                            {res.content_masked || '••••••••••••••••'}
                          </div>
                        )}
                      </div>

                      {/* Notes if available */}
                      {res.notes && (
                        <div className="text-[11px] text-obsidian-muted/90 italic line-clamp-2 px-1">
                          {res.notes}
                        </div>
                      )}

                      {/* Tags */}
                      {res.tags && res.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {res.tags.map((t, idx) => (
                            <span
                              key={idx}
                              className="px-1.5 py-0.5 rounded bg-obsidian-surface text-[10px] text-obsidian-muted border border-obsidian-border"
                            >
                              #{t.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Bottom Metadata */}
                    <div className="pt-2 border-t border-obsidian-border/60 flex items-center justify-between text-[10px] text-obsidian-muted">
                      <span className="capitalize">
                        {res.ownership_type === 'own'
                          ? 'Uso Propio / Interno'
                          : res.ownership_type === 'client'
                          ? 'Vinculado a Cliente'
                          : 'Independiente'}
                      </span>
                      <span>
                        {res.updated_at
                          ? new Date(res.updated_at).toLocaleDateString()
                          : 'Reciente'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty State */}
          {filteredResources.length === 0 && !loadingResources && (
            <div className="p-12 rounded-2xl bg-obsidian-panel border border-obsidian-border text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mx-auto">
                <FolderLock size={22} />
              </div>
              {resources.length === 0 ? (
                <>
                  <div className="text-sm font-bold text-white">
                    No hay recursos seguros ni notas en este ámbito
                  </div>
                  <div className="text-xs text-obsidian-muted max-w-md mx-auto">
                    Guarda variables de entorno (.env), llaves SSH, licencias de software, códigos 2FA y notas privadas cifradas con AES-256-GCM.
                  </div>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleOpenCreateResourceModal}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all"
                    >
                      <Plus size={14} />
                      <span>+ Crear Recurso Seguro</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-sm font-bold text-white">Sin coincidencias para "{resSearch}"</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SECURE RESOURCE MODAL */}
      {isResourceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-xl rounded-2xl bg-obsidian-panel border border-obsidian-border shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-obsidian-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <FolderLock size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">
                    {editingResource ? 'Editar Recurso Seguro' : 'Nuevo Recurso Seguro'}
                  </h3>
                  <div className="text-[11px] text-obsidian-muted">
                    Bóveda encriptada localmente con AES-256-GCM
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsResourceModalOpen(false)}
                className="p-1.5 rounded-lg bg-obsidian-surface hover:bg-obsidian-border text-obsidian-muted hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveResource} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto text-xs">
              {/* Title */}
              <div>
                <label className="block text-obsidian-muted font-medium mb-1.5">
                  Título o Nombre del Recurso *
                </label>
                <input
                  ref={titleInputRef}
                  type="text"
                  required
                  maxLength={INPUT_LIMITS.NAME}
                  value={resTitle}
                  onChange={(e) => setResTitle(e.target.value)}
                  placeholder="Ej. Variables .env Producción AWS / Llave SSH Hetzner / Licencia JetBrains..."
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs placeholder-obsidian-muted/60 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Type, Scope & Ownership grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Resource Type */}
                <div>
                  <label className="block text-obsidian-muted font-medium mb-1.5">
                    Tipo de Recurso
                  </label>
                  <select
                    value={resType}
                    onChange={(e) => setResType(e.target.value as SecureResourceType)}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
                  >
                    <option value="env_file">Archivo .env (Variables)</option>
                    <option value="ssh_key">Llave SSH / Certificado</option>
                    <option value="backup_codes">Códigos 2FA / Backup</option>
                    <option value="software_license">Licencia de Software</option>
                    <option value="nota_segura">Nota Privada Libre</option>
                  </select>
                </div>

                {/* Scope */}
                <div>
                  <label className="block text-obsidian-muted font-medium mb-1.5">
                    Ámbito
                  </label>
                  <select
                    value={resScope}
                    onChange={(e) => setResScope(e.target.value as EntityScope)}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
                  >
                    <option value="business">Empresa / Trabajo</option>
                    <option value="personal">Personal</option>
                    <option value="shared">Compartido</option>
                  </select>
                </div>

                {/* Ownership */}
                <div>
                  <label className="block text-obsidian-muted font-medium mb-1.5">
                    Destino
                  </label>
                  <select
                    value={resOwnership}
                    onChange={(e) => setResOwnership(e.target.value as OwnershipType)}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
                  >
                    <option value="own">Uso Propio / Interno</option>
                    <option value="client">Vinculado a Cliente</option>
                    <option value="independent">Independiente</option>
                  </select>
                </div>
              </div>

              {/* Secret Content */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-obsidian-muted font-medium">
                    Contenido Sensible (Cifrado con AES-256-GCM)
                  </label>
                  <span className="text-[10px] text-indigo-400 font-mono">100% Local</span>
                </div>
                <textarea
                  rows={6}
                  value={resContent}
                  onChange={(e) => setResContent(e.target.value)}
                  placeholder="Pega aquí el contenido de tu archivo .env, clave SSH privada o pública, códigos de recuperación 2FA, seriales de licencia o secretos..."
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-indigo-100 font-mono text-[11px] placeholder-obsidian-muted/60 focus:outline-none focus:border-indigo-500 whitespace-pre"
                />
              </div>

              {/* Tags */}
              <div>
                <label className="block text-obsidian-muted font-medium mb-1.5">
                  Etiquetas (separadas por coma)
                </label>
                <input
                  type="text"
                  value={resTags}
                  onChange={(e) => setResTags(e.target.value)}
                  placeholder="Ej. aws, docker, backend, produccion..."
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs placeholder-obsidian-muted/60 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-obsidian-muted font-medium mb-1.5">
                  Notas Privadas o Instrucciones Adicionales
                </label>
                <textarea
                  rows={2}
                  maxLength={INPUT_LIMITS.NOTES}
                  value={resNotes}
                  onChange={(e) => setResNotes(e.target.value)}
                  placeholder="Instrucciones de despliegue, cómo regenerar esta clave, etc."
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs placeholder-obsidian-muted/60 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Form Actions */}
              <div className="pt-3 border-t border-obsidian-border flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsResourceModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-obsidian-surface hover:bg-obsidian-border border border-obsidian-border text-white text-xs font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingResource}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all"
                >
                  <Check size={14} />
                  <span>{savingResource ? 'Guardando...' : editingResource ? 'Actualizar Recurso' : 'Guardar Recurso'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
