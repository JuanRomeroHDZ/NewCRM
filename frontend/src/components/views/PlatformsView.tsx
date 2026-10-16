import React, { useState, useEffect } from 'react';
import { 
  Globe, Plus, Search, Filter, Key, ExternalLink, 
  ArrowRight, ShieldCheck, Tag, DollarSign, Lock 
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { PlatformAccount, EmailAccount } from '../../types';
import { PlatformIcon } from '../common/PlatformIcon';
import { TagBadge } from '../common/TagBadge';
import { SecretField } from '../common/SecretField';
import { CopyButton } from '../common/CopyButton';

export const PlatformsView: React.FC = () => {
  const { 
    openInspector, openPlatformModal, isUnlocked, 
    openUnlockModal, dataVersion 
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

  // Extract all unique tag names
  const allTags = Array.from(
    new Set(platforms.flatMap(p => p.tags?.map(t => t.name) || []))
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 animate-fadeIn">
      {/* Header and Add button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
            <Globe className="text-indigo-400" size={18} />
            <span>Directorio de Plataformas & Servicios</span>
          </h2>
          <p className="text-xs text-obsidian-muted">
            Servicios vinculados organizados por correo padre, tipo de acceso y métricas financieras
          </p>
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
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all whitespace-nowrap"
        >
          <Plus size={14} />
          <span>Vincular Plataforma</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-obsidian-panel border border-obsidian-border flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
          {/* Search box */}
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-2.5 text-obsidian-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por plataforma o usuario..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-xs text-white placeholder-obsidian-muted/60 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Email filter */}
          <select
            value={selectedEmail}
            onChange={(e) => setSelectedEmail(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-obsidian-text focus:outline-none focus:border-indigo-500"
          >
            <option value="">Todos los Correos Padre</option>
            {emails.map((e) => (
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
            <option value="active">Activa</option>
            <option value="free_trial">Prueba Gratuita</option>
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
        <div className="flex items-center p-1 rounded-xl bg-obsidian-bg border border-obsidian-border">
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
      {viewMode === 'table' ? (
        <div className="rounded-2xl bg-obsidian-panel border border-obsidian-border overflow-hidden">
          <table className="w-full text-left text-xs text-obsidian-text">
            <thead className="bg-obsidian-surface/60 border-b border-obsidian-border text-obsidian-muted font-semibold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Plataforma</th>
                <th className="py-3 px-4">Correo Padre</th>
                <th className="py-3 px-4">Usuario / Handle</th>
                <th className="py-3 px-4">Acceso / Clave</th>
                <th className="py-3 px-4">Suscripción</th>
                <th className="py-3 px-4">Etiquetas</th>
                <th className="py-3 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-obsidian-border">
              {platforms.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => openInspector('platform', p.id)}
                  className="hover:bg-obsidian-surface/50 transition-colors cursor-pointer group"
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <PlatformIcon name={p.name} iconUrl={p.icon_url} size="sm" />
                      <div>
                        <span className="font-semibold text-white group-hover:text-indigo-300 transition-colors block">
                          {p.name}
                        </span>
                        {p.login_url && (
                          <span className="text-[10px] text-obsidian-muted font-mono truncate max-w-[140px] block">
                            {p.login_url.replace(/^https?:\/\//, '')}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="py-3 px-4 font-mono text-[11px] text-cyan-300">
                    {p.email_address}
                  </td>

                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1 font-mono text-white select-all">
                      <span>{p.username || p.specific_alias || 'N/A'}</span>
                      {p.username && <CopyButton value={p.username} label="Usuario" />}
                    </div>
                  </td>

                  <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                    {p.access_type === 'sso' ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                        SSO Federado
                      </span>
                    ) : (
                      <SecretField
                        value={p.password_plain}
                        masked={p.password_masked}
                        label="Contraseña"
                      />
                    )}
                  </td>

                  <td className="py-3 px-4">
                    {p.subscription_status === 'active' ? (
                      <div>
                        <span className="font-mono text-white font-bold block">
                          ${p.subscription_cost} {p.currency}
                        </span>
                        <span className="text-[10px] text-obsidian-muted">/{p.billing_cycle}</span>
                      </div>
                    ) : p.subscription_status === 'free_trial' ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        Free Trial
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
                          title="Abrir enlace"
                          className="p-1.5 hover:text-white rounded hover:bg-obsidian-surface"
                        >
                          <ExternalLink size={13} />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => openInspector('platform', p.id)}
                        title="Ver detalles"
                        className="p-1.5 hover:text-white rounded hover:bg-obsidian-surface"
                      >
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Grid view */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {platforms.map((p) => (
            <div
              key={p.id}
              onClick={() => openInspector('platform', p.id)}
              className="p-5 rounded-2xl bg-obsidian-panel border border-obsidian-border hover:border-obsidian-borderLight transition-all cursor-pointer group space-y-3 shadow-lg"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <PlatformIcon name={p.name} iconUrl={p.icon_url} size="md" />
                  <div>
                    <h3 className="font-bold text-white text-sm group-hover:text-indigo-300 transition-colors">
                      {p.name}
                    </h3>
                    <p className="text-[11px] text-obsidian-muted font-mono">{p.email_address}</p>
                  </div>
                </div>

                {p.subscription_status === 'active' && (
                  <span className="font-mono text-xs font-bold text-emerald-400">
                    ${p.subscription_cost} {p.currency}
                  </span>
                )}
              </div>

              <div className="p-2.5 rounded-xl bg-obsidian-surface border border-obsidian-border text-xs flex items-center justify-between">
                <span className="text-obsidian-muted font-mono text-[11px] truncate max-w-[180px]">
                  {p.username || p.specific_alias || 'Sin usuario'}
                </span>
                <SecretField value={p.password_plain} masked={p.password_masked} label="Clave" />
              </div>

              <div className="flex flex-wrap gap-1 pt-1">
                {p.tags?.map((t, idx) => (
                  <TagBadge key={idx} name={t.name} color={t.color} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {platforms.length === 0 && !loading && (
        <div className="py-16 text-center text-obsidian-muted text-xs">
          No se encontraron plataformas con los filtros seleccionados.
        </div>
      )}
    </div>
  );
};
