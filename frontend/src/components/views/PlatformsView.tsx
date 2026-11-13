import React, { useState, useEffect } from 'react';
import { 
  Globe, Plus, Search, ExternalLink, 
  Edit3, Trash2, Briefcase, User, Users 
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { PlatformAccount, EmailAccount } from '../../types';
import { PlatformIcon } from '../common/PlatformIcon';
import { TagBadge } from '../common/TagBadge';
import { SecretField } from '../common/SecretField';
import { CopyButton } from '../common/CopyButton';
import { InfoTooltip } from '../common/InfoTooltip';
import { INPUT_LIMITS } from '../../lib/validation';

export const PlatformsView: React.FC = () => {
  const { 
    openInspector, openPlatformModal, isUnlocked, 
    openUnlockModal, showToast, triggerDataReload, dataVersion,
    matchesScope 
  } = useVault();

  const [platforms, setPlatforms] = useState<PlatformAccount[]>([]);
  const [emails, setEmails] = useState<EmailAccount[]>([]);
  const [search, setSearch] = useState('');
  const [selectedEmail, setSelectedEmail] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getPlatforms({
        search: search || undefined,
        email_id: selectedEmail || undefined,
        status: selectedStatus || undefined,
        tag: selectedTag || undefined
      }),
      api.getEmails()
    ]).then(([pList, eList]) => {
      setPlatforms(pList);
      setEmails(eList);
    }).catch(console.error).finally(() => setLoading(false));
  }, [search, selectedEmail, selectedStatus, selectedTag, isUnlocked, dataVersion]);

  const filteredPlatforms = platforms.filter((p) => matchesScope(p.scope));
  const filteredEmails = emails.filter((e) => matchesScope(e.scope));

  const allTags = Array.from(
    new Set(filteredPlatforms.flatMap(p => p.tags?.map(t => t.name) || []))
  );

  const handleDeletePlatform = async (e: React.MouseEvent, p: PlatformAccount) => {
    e.stopPropagation();
    if (!isUnlocked) {
      openUnlockModal();
      return;
    }
    if (!window.confirm(`¿Enviar la plataforma "${p.name}" a la papelera?`)) return;
    try {
      await api.deletePlatform(p.id);
      showToast(`Plataforma "${p.name}" enviada a la papelera.`, 'info');
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const hasActiveFilters = Boolean(search || selectedEmail || selectedStatus || selectedTag);

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 animate-fadeIn">
      {/* Header and Add button */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <Globe className="text-indigo-400 flex-shrink-0" size={18} />
          <h2 className="text-base font-bold text-white tracking-tight truncate">
            Cuentas y Servicios ({filteredPlatforms.length})
          </h2>
          <InfoTooltip
            title="Cuentas y Servicios"
            content="Cuentas y herramientas conectadas a tus correos principales con sus contraseñas, llaves de conexión y suscripciones."
          />
        </div>

        <button
          type="button"
          onClick={() => {
            if (!isUnlocked) {
              openUnlockModal();
            } else {
              openPlatformModal();
            }
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all whitespace-nowrap flex-shrink-0"
        >
          <Plus size={14} />
          <span>Nueva Cuenta o Servicio</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-obsidian-panel border border-obsidian-border flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          {/* Search box */}
          <div className="relative min-w-0 w-full flex-1 sm:min-w-[180px]">
            <Search size={14} className="absolute left-3 top-2.5 text-obsidian-muted" />
            <input
              type="text"
              maxLength={INPUT_LIMITS.SEARCH}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre de servicio o usuario..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-xs text-white placeholder-obsidian-muted/60 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Email filter */}
          <select
            value={selectedEmail}
            onChange={(e) => setSelectedEmail(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-obsidian-text focus:outline-none focus:border-indigo-500 max-w-[220px] truncate"
          >
            <option value="">Todos los Correos Principales</option>
            {filteredEmails.map((e) => (
              <option key={e.id} value={e.id}>
                {e.address}
              </option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-obsidian-text focus:outline-none focus:border-indigo-500"
          >
            <option value="">Todos los Estados</option>
            <option value="active">Activa (Con cobro)</option>
            <option value="free_trial">Prueba Gratuita</option>
            <option value="none">Gratis / Sin cobro</option>
            <option value="paused">Pausada</option>
            <option value="cancelled">Cancelada</option>
          </select>

          {/* Tag filter */}
          {allTags.length > 0 && (
            <select
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-obsidian-text focus:outline-none focus:border-indigo-500"
            >
              <option value="">Todas las Etiquetas</option>
              {allTags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* View Toggle */}
        <div className="flex items-center p-1 rounded-xl bg-obsidian-bg border border-obsidian-border flex-shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              viewMode === 'table' ? 'bg-obsidian-surface text-white' : 'text-obsidian-muted hover:text-white'
            }`}
          >
            Tabla
          </button>
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              viewMode === 'grid' ? 'bg-obsidian-surface text-white' : 'text-obsidian-muted hover:text-white'
            }`}
          >
            Tarjetas
          </button>
        </div>
      </div>

      {/* Content Rendering */}
      {filteredPlatforms.length > 0 && viewMode === 'table' && (
        <div className="rounded-2xl bg-obsidian-panel border border-obsidian-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-obsidian-text">
              <thead className="bg-obsidian-surface/60 border-b border-obsidian-border text-obsidian-muted font-semibold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Servicio</th>
                  <th className="py-3 px-4">Ámbito</th>
                  <th className="py-3 px-4">Correo Asociado</th>
                  <th className="py-3 px-4">Usuario</th>
                  <th className="py-3 px-4">Contraseña / Acceso</th>
                  <th className="py-3 px-4">Suscripción</th>
                  <th className="py-3 px-4">Etiquetas</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-obsidian-border">
                {filteredPlatforms.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => openInspector('platform', p.id)}
                    className="hover:bg-obsidian-surface/50 transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-4 max-w-[200px]">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <PlatformIcon name={p.name} iconUrl={p.icon_url} size="sm" />
                        <div className="min-w-0">
                          <span className="font-semibold text-white group-hover:text-indigo-300 transition-colors block truncate" title={p.name}>
                            {p.name}
                          </span>
                          {p.login_url && (
                            <span className="text-[10px] text-obsidian-muted font-mono truncate max-w-[140px] block" title={p.login_url}>
                              {p.login_url.replace(/^https?:\/\//, '')}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      {p.scope === 'personal' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <User size={10} />
                          <span>Personal</span>
                        </span>
                      ) : p.scope === 'shared' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          <Users size={10} />
                          <span>Compartido</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          <Briefcase size={10} />
                          <span>Empresa</span>
                        </span>
                      )}
                    </td>

                    <td
                      className="py-3 px-4 font-mono text-[11px] text-cyan-300 max-w-[190px] truncate"
                      title={p.specific_alias || p.email_address || ''}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (p.email_id) openInspector('email', p.email_id);
                      }}
                    >
                      <span className="hover:underline">{p.specific_alias || p.email_address}</span>
                    </td>

                    <td className="py-3 px-4 max-w-[180px]" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1 font-mono text-white min-w-0">
                        <span className="truncate" title={p.username || p.specific_alias || ''}>
                          {p.username || p.specific_alias || '—'}
                        </span>
                        {(p.username || p.specific_alias) && (
                          <CopyButton value={p.username || p.specific_alias || ''} label="Usuario" />
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                      {p.access_type === 'sso' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          Inicio con correo
                        </span>
                      ) : (
                        <SecretField
                          value={p.password_plain}
                          masked={p.password_masked}
                          label="Contraseña"
                        />
                      )}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      {p.subscription_status === 'active' ? (
                        <div>
                          <span className="font-mono text-white font-bold block">
                            ${p.subscription_cost} {p.currency}
                          </span>
                          <span className="text-[10px] text-obsidian-muted">/{p.billing_cycle}</span>
                        </div>
                      ) : p.subscription_status === 'free_trial' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          Prueba Gratuita
                        </span>
                      ) : (
                        <span className="text-obsidian-muted uppercase text-[10px]">{p.subscription_status}</span>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1 max-w-[160px]">
                        {p.tags?.slice(0, 2).map((t, idx) => (
                          <TagBadge key={idx} name={t.name} color={t.color} />
                        ))}
                      </div>
                    </td>

                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1 text-obsidian-muted">
                        {p.login_url && (
                          <a
                            href={p.login_url}
                            target="_blank"
                            rel="noreferrer"
                            title="Abrir sitio oficial"
                            className="p-1.5 hover:text-white rounded hover:bg-obsidian-surface"
                          >
                            <ExternalLink size={13} />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (!isUnlocked) openUnlockModal();
                            else openPlatformModal(undefined, p.id);
                          }}
                          title="Editar plataforma"
                          className="p-1.5 hover:text-white rounded hover:bg-obsidian-surface"
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeletePlatform(e, p)}
                          title="Eliminar plataforma"
                          className="p-1.5 hover:text-rose-400 rounded hover:bg-obsidian-surface"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Grid view */}
      {filteredPlatforms.length > 0 && viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPlatforms.map((p) => (
            <div
              key={p.id}
              onClick={() => openInspector('platform', p.id)}
              className="p-5 rounded-2xl bg-obsidian-panel border border-obsidian-border hover:border-obsidian-borderLight transition-all cursor-pointer group space-y-3 shadow-lg min-w-0 overflow-hidden"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <PlatformIcon name={p.name} iconUrl={p.icon_url} size="md" />
                  <div className="min-w-0">
                    <h3 className="font-bold text-white text-sm group-hover:text-indigo-300 transition-colors truncate" title={p.name}>
                      {p.name}
                    </h3>
                    <p
                      className="text-[11px] text-obsidian-muted font-mono truncate"
                      title={p.specific_alias || p.email_address || ''}
                    >
                      {p.specific_alias || p.email_address}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  {p.login_url && (
                    <a
                      href={p.login_url}
                      target="_blank"
                      rel="noreferrer"
                      title="Abrir enlace"
                      className="p-1.5 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface"
                    >
                      <ExternalLink size={13} />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (!isUnlocked) openUnlockModal();
                      else openPlatformModal(undefined, p.id);
                    }}
                    title="Editar plataforma"
                    className="p-1.5 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface"
                  >
                    <Edit3 size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDeletePlatform(e, p)}
                    title="Eliminar plataforma"
                    className="p-1.5 text-obsidian-muted hover:text-rose-400 rounded-lg hover:bg-obsidian-surface"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-obsidian-surface border border-obsidian-border text-xs flex items-center justify-between gap-2 min-w-0">
                <span className="text-obsidian-muted font-mono text-[11px] truncate" title={p.username || p.specific_alias || 'Sin usuario'}>
                  {p.username || p.specific_alias || 'Sin usuario'}
                </span>
                <SecretField value={p.password_plain} masked={p.password_masked} label="Clave" />
              </div>

              <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                <div className="flex flex-wrap items-center gap-1 min-w-0">
                  {p.scope === 'personal' ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <User size={9} />
                      <span>Personal</span>
                    </span>
                  ) : p.scope === 'shared' ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      <Users size={9} />
                      <span>Compartido</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      <Briefcase size={9} />
                      <span>Empresa</span>
                    </span>
                  )}
                  {p.tags?.map((t, idx) => (
                    <TagBadge key={idx} name={t.name} color={t.color} />
                  ))}
                </div>
                {p.subscription_status === 'active' && (
                  <span className="font-mono text-xs font-bold text-emerald-400 flex-shrink-0">
                    ${p.subscription_cost} {p.currency}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Clean Empty State */}
      {filteredPlatforms.length === 0 && !loading && (
        <div className="py-16 px-4 rounded-2xl bg-obsidian-panel border border-obsidian-border text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto">
            <Globe size={22} />
          </div>
          <h3 className="text-sm font-semibold text-white">
            {hasActiveFilters
              ? 'No se encontraron plataformas con los filtros seleccionados'
              : 'No hay plataformas ni servicios vinculados en este ámbito'}
          </h3>
          <div className="pt-1 flex items-center justify-center gap-2">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setSelectedEmail('');
                  setSelectedStatus('');
                  setSelectedTag('');
                }}
                className="px-3.5 py-2 rounded-xl bg-obsidian-surface hover:bg-obsidian-border text-white text-xs font-medium border border-obsidian-border"
              >
                Limpiar Filtros
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (!isUnlocked) openUnlockModal();
                else openPlatformModal();
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20"
            >
              <Plus size={14} />
              <span>Vincular Primera Plataforma</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
