import React, { useState, useEffect, useId, useCallback } from 'react';
import {
  Globe,
  Plus,
  Search,
  ExternalLink,
  Edit3,
  Trash2,
  Briefcase,
  User,
  Users,
  AlertTriangle,
  LoaderCircle,
  Lock,
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { PlatformAccount, EmailAccount } from '../../types';
import { PlatformIcon } from '../common/PlatformIcon';
import { TagBadge } from '../common/TagBadge';
import { SecretField } from '../common/SecretField';
import { CopyButton } from '../common/CopyButton';
import { InfoTooltip } from '../common/InfoTooltip';
import { EmptyState } from '../common/EmptyState';
import { INPUT_LIMITS } from '../../lib/validation';

export const PlatformsView: React.FC = () => {
  const {
    openInspector,
    openPlatformModal,
    isUnlocked,
    openUnlockModal,
    showToast,
    triggerDataReload,
    dataVersion,
    matchesScope,
    confirm,
    supportedCurrencies,
    systemLocale,
  } = useVault();

  const searchInputId = useId();
  const emailFilterId = useId();
  const statusFilterId = useId();
  const tagFilterId = useId();

  const [platforms, setPlatforms] = useState<PlatformAccount[]>([]);
  const [emails, setEmails] = useState<EmailAccount[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [selectedEmail, setSelectedEmail] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>(() =>
    typeof window !== 'undefined' && window.innerWidth >= 1024 ? 'table' : 'grid'
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  const getCurrencySymbol = useCallback(
    (code?: string) => supportedCurrencies.find((c) => c.code === code)?.symbol || '$',
    [supportedCurrencies]
  );

  const formatCost = useCallback(
    (amount: number, currency?: string) => {
      const symbol = getCurrencySymbol(currency);
      const formatted = Number(amount || 0).toLocaleString(systemLocale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      return `${symbol}${formatted}`;
    },
    [getCurrencySymbol, systemLocale]
  );

  useEffect(() => {
    if (!isUnlocked) {
      setPlatforms([]);
      setEmails([]);
      setAllTags([]);
      setError('');
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError('');
    const hasFilter = Boolean(search || selectedEmail || selectedStatus || selectedTag);

    Promise.all([
      api.getPlatforms({
        search: search || undefined,
        email_id: selectedEmail || undefined,
        status: selectedStatus || undefined,
        tag: selectedTag || undefined,
      }),
      api.getEmails(),
      hasFilter ? api.getPlatforms() : Promise.resolve(null),
    ])
      .then(([pList, eList, fullList]) => {
        if (!active) return;
        setPlatforms(pList);
        setEmails(eList);
        const tagSource = fullList ?? pList;
        const extractedTags = Array.from(
          new Set(tagSource.flatMap((p) => p.tags?.map((t) => t.name) || []).filter(Boolean))
        );
        setAllTags(extractedTags);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'No se pudieron cargar las cuentas y servicios.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [search, selectedEmail, selectedStatus, selectedTag, isUnlocked, dataVersion, attempt]);

  const filteredPlatforms = platforms.filter((p) => matchesScope(p.scope));
  const filteredEmails = emails.filter((e) => matchesScope(e.scope));

  const handleDeletePlatform = async (p: PlatformAccount) => {
    if (!isUnlocked) {
      openUnlockModal();
      return;
    }
    const accepted = await confirm({
      title: 'Enviar plataforma a la papelera',
      message: `¿Enviar la plataforma "${p.name}" a la papelera?`,
      confirmLabel: 'Enviar a papelera',
      tone: 'danger',
    });
    if (!accepted) return;

    try {
      await api.deletePlatform(p.id);
      showToast(`Plataforma "${p.name}" enviada a la papelera.`, 'info');
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message || 'No se pudo eliminar la plataforma.', 'error');
    }
  };

  const hasActiveFilters = Boolean(search || selectedEmail || selectedStatus || selectedTag);

  return (
    <div className="mx-auto max-w-7xl min-w-0 space-y-4 p-3 sm:space-y-6 sm:p-8 animate-fadeIn">
      {/* Header and Add button */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <Globe className="flex-shrink-0 text-indigo-400" size={18} aria-hidden="true" />
          <h2 aria-live="polite" className="truncate text-base font-bold tracking-tight text-white">
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
          className="inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-left text-xs font-semibold text-white transition-colors hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        >
          <Plus size={14} aria-hidden="true" />
          <span>Nueva cuenta o servicio</span>
        </button>
      </div>

      {/* Locked Banner */}
      {!isUnlocked && (
        <div className="flex flex-col justify-between gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-start gap-3 text-xs text-amber-200 sm:items-center">
            <Lock size={16} className="mt-0.5 flex-shrink-0 text-amber-400 sm:mt-0" aria-hidden="true" />
            <span className="leading-relaxed">
              Bóveda bloqueada. Desbloquea con tu contraseña de acceso para consultar cuentas, contraseñas y suscripciones.
            </span>
          </div>
          <button
            type="button"
            onClick={openUnlockModal}
            className="min-h-[38px] flex-shrink-0 self-end rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white whitespace-nowrap hover:bg-indigo-500 sm:self-auto"
          >
            Desbloquear Bóveda
          </button>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-y border-obsidian-border py-3 text-xs">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {/* Search box */}
          <div className="relative min-w-0 w-full flex-1 sm:min-w-[180px]">
            <label htmlFor={searchInputId} className="sr-only">
              Buscar cuentas o servicios
            </label>
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-obsidian-muted" aria-hidden="true" />
            <input
              id={searchInputId}
              type="search"
              maxLength={INPUT_LIMITS.SEARCH}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre de servicio o usuario..."
              aria-label="Buscar por nombre de servicio o usuario"
              className="min-h-[38px] w-full rounded-xl border border-obsidian-border bg-obsidian-bg pl-8 pr-3 py-1.5 text-xs text-white placeholder-obsidian-muted/60 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Email filter */}
          <label htmlFor={emailFilterId} className="sr-only">
            Filtrar por correo principal
          </label>
          <select
            id={emailFilterId}
            aria-label="Filtrar por correo principal"
            value={selectedEmail}
            onChange={(e) => setSelectedEmail(e.target.value)}
            className="min-h-[38px] max-w-full min-w-0 rounded-lg border border-obsidian-border bg-obsidian-bg px-3 py-2 text-obsidian-text focus:border-indigo-500 focus:outline-none sm:max-w-[220px]"
          >
            <option value="">Todos los Correos Principales</option>
            {filteredEmails.map((e) => (
              <option key={e.id} value={e.id}>
                {e.address}
              </option>
            ))}
          </select>

          {/* Status filter */}
          <label htmlFor={statusFilterId} className="sr-only">
            Filtrar por estado de suscripción
          </label>
          <select
            id={statusFilterId}
            aria-label="Filtrar por estado de suscripción"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="min-h-[38px] max-w-full min-w-0 rounded-lg border border-obsidian-border bg-obsidian-bg px-3 py-2 text-obsidian-text focus:border-indigo-500 focus:outline-none"
          >
            <option value="">Todos los Estados</option>
            <option value="active">Activa (Con cobro)</option>
            <option value="free_trial">Prueba Gratuita</option>
            <option value="free">Gratis / Sin cobro</option>
            <option value="paused">Pausada</option>
            <option value="cancelled">Cancelada</option>
          </select>

          {/* Tag filter */}
          {allTags.length > 0 && (
            <>
              <label htmlFor={tagFilterId} className="sr-only">
                Filtrar por etiqueta
              </label>
              <select
                id={tagFilterId}
                aria-label="Filtrar por etiqueta"
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                className="min-h-[38px] max-w-full min-w-0 rounded-lg border border-obsidian-border bg-obsidian-bg px-3 py-2 text-obsidian-text focus:border-indigo-500 focus:outline-none"
              >
                <option value="">Todas las Etiquetas</option>
                {allTags.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>

        {/* View Toggle */}
        <div
          role="group"
          aria-label="Modo de visualización"
          className="hidden shrink-0 items-center rounded-xl border border-obsidian-border bg-obsidian-bg p-1 md:flex"
        >
          <button
            type="button"
            aria-pressed={viewMode === 'table'}
            onClick={() => setViewMode('table')}
            className={`min-h-[32px] rounded-lg px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
              viewMode === 'table' ? 'bg-obsidian-surface text-white' : 'text-obsidian-muted hover:text-white'
            }`}
          >
            Tabla
          </button>
          <button
            type="button"
            aria-pressed={viewMode === 'grid'}
            onClick={() => setViewMode('grid')}
            className={`min-h-[32px] rounded-lg px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
              viewMode === 'grid' ? 'bg-obsidian-surface text-white' : 'text-obsidian-muted hover:text-white'
            }`}
          >
            Tarjetas
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div
          role="status"
          className="flex items-center justify-center gap-2.5 rounded-2xl border border-obsidian-border bg-obsidian-panel p-8 text-xs text-obsidian-muted"
        >
          <LoaderCircle size={18} className="animate-spin text-indigo-400" aria-hidden="true" />
          <span>Cargando cuentas y servicios…</span>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <EmptyState
          icon={AlertTriangle}
          tone="error"
          title="No se pudieron cargar las cuentas y servicios"
          description={error}
          actionLabel="Reintentar"
          onAction={() => setAttempt((value) => value + 1)}
        />
      )}

      {/* Table View (desktop/tablet when selected, compact columns at md) */}
      {!loading && !error && filteredPlatforms.length > 0 && viewMode === 'table' && (
        <div className="hidden overflow-hidden rounded-xl border border-obsidian-border bg-obsidian-panel md:block">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-obsidian-text">
              <thead className="border-b border-obsidian-border bg-obsidian-surface/60 text-[10px] font-semibold uppercase tracking-wider text-obsidian-muted">
                <tr>
                  <th className="px-4 py-3">Servicio</th>
                  <th className="hidden px-4 py-3 xl:table-cell">Ámbito</th>
                  <th className="px-4 py-3">Correo Asociado</th>
                  <th className="hidden px-4 py-3 lg:table-cell">Usuario</th>
                  <th className="px-4 py-3">Contraseña / Acceso</th>
                  <th className="px-4 py-3">Suscripción</th>
                  <th className="hidden px-4 py-3 xl:table-cell">Etiquetas</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-obsidian-border">
                {filteredPlatforms.map((p) => (
                  <tr key={p.id} className="group transition-colors hover:bg-obsidian-surface/50">
                    <td className="max-w-[210px] px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openInspector('platform', p.id)}
                        aria-label={`Ver detalles de ${p.name}`}
                        className="flex min-w-0 max-w-full items-center gap-2.5 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                      >
                        <PlatformIcon name={p.name} iconUrl={p.icon_url} size="sm" />
                        <div className="min-w-0">
                          <span
                            className="block truncate font-semibold text-white transition-colors group-hover:text-indigo-300"
                            title={p.name}
                          >
                            {p.name}
                          </span>
                          {p.login_url && (
                            <span
                              className="block max-w-[140px] truncate font-mono text-[10px] text-obsidian-muted"
                              title={p.login_url}
                            >
                              {p.login_url.replace(/^https?:\/\//, '')}
                            </span>
                          )}
                        </div>
                      </button>
                    </td>

                    <td className="hidden whitespace-nowrap px-4 py-3 xl:table-cell">
                      {p.scope === 'personal' ? (
                        <span className="inline-flex items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                          <User size={10} aria-hidden="true" />
                          <span>Personal</span>
                        </span>
                      ) : p.scope === 'shared' ? (
                        <span className="inline-flex items-center gap-1 rounded border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-400">
                          <Users size={10} aria-hidden="true" />
                          <span>Compartido</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-400">
                          <Briefcase size={10} aria-hidden="true" />
                          <span>Empresa</span>
                        </span>
                      )}
                    </td>

                    <td className="max-w-[190px] truncate px-4 py-3 font-mono text-[11px] text-cyan-300">
                      {p.email_id ? (
                        <button
                          type="button"
                          onClick={() => openInspector('email', p.email_id!)}
                          title={p.specific_alias || p.email_address || ''}
                          className="max-w-full truncate hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                        >
                          {p.specific_alias || p.email_address}
                        </button>
                      ) : (
                        <span className="text-obsidian-muted">—</span>
                      )}
                    </td>

                    <td className="hidden max-w-[180px] px-4 py-3 lg:table-cell">
                      <div className="flex min-w-0 items-center gap-1 font-mono text-white">
                        <span className="truncate" title={p.username || p.specific_alias || ''}>
                          {p.username || p.specific_alias || '—'}
                        </span>
                        {(p.username || p.specific_alias) && (
                          <CopyButton
                            value={p.username || p.specific_alias || ''}
                            label="Usuario"
                            className="min-h-[32px] min-w-[32px]"
                          />
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      {p.access_type === 'sso' ? (
                        <span className="rounded border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-400">
                          Inicio con correo
                        </span>
                      ) : (
                        <SecretField value={p.password_plain} masked={p.password_masked} label="Contraseña" />
                      )}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      {p.subscription_status === 'active' ? (
                        <div>
                          <span className="block font-mono font-bold text-white">
                            {formatCost(p.subscription_cost, p.currency)} {p.currency}
                          </span>
                          <span className="text-[10px] text-obsidian-muted">/{p.billing_cycle}</span>
                        </div>
                      ) : p.subscription_status === 'free_trial' ? (
                        <span className="rounded border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                          Prueba Gratuita
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase text-obsidian-muted">{p.subscription_status}</span>
                      )}
                    </td>

                    <td className="hidden px-4 py-3 xl:table-cell">
                      <div className="flex max-w-[160px] flex-wrap gap-1">
                        {p.tags?.slice(0, 2).map((t, idx) => (
                          <TagBadge key={idx} name={t.name} color={t.color} />
                        ))}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 text-obsidian-muted">
                        {p.login_url && (
                          <a
                            href={p.login_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Abrir sitio oficial"
                            aria-label={`Abrir sitio oficial de ${p.name}`}
                            className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg hover:bg-obsidian-surface hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                          >
                            <ExternalLink size={14} aria-hidden="true" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (!isUnlocked) openUnlockModal();
                            else openPlatformModal(undefined, p.id);
                          }}
                          title="Editar plataforma"
                          aria-label={`Editar ${p.name}`}
                          className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg hover:bg-obsidian-surface hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                        >
                          <Edit3 size={14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePlatform(p)}
                          title="Eliminar plataforma"
                          aria-label={`Eliminar ${p.name}`}
                          className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg hover:bg-obsidian-surface hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                        >
                          <Trash2 size={14} aria-hidden="true" />
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

      {/* Grid view (always on <md, or when grid mode selected) */}
      {!loading && !error && filteredPlatforms.length > 0 && (
        <div
          className={`grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 ${
            viewMode === 'table' ? 'md:hidden' : ''
          }`}
        >
          {filteredPlatforms.map((p) => (
            <article
              key={p.id}
              className="group min-w-0 space-y-3 overflow-hidden rounded-xl border border-obsidian-border bg-obsidian-panel p-3 transition-colors hover:border-obsidian-borderLight sm:p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => openInspector('platform', p.id)}
                  aria-label={`Ver detalles de ${p.name}`}
                  className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                >
                  <PlatformIcon name={p.name} iconUrl={p.icon_url} size="md" />
                  <div className="min-w-0 flex-1">
                    <h3
                      className="truncate text-sm font-bold text-white transition-colors group-hover:text-indigo-300"
                      title={p.name}
                    >
                      {p.name}
                    </h3>
                    <p
                      className="truncate font-mono text-[11px] text-obsidian-muted"
                      title={p.specific_alias || p.email_address || ''}
                    >
                      {p.specific_alias || p.email_address}
                    </p>
                  </div>
                </button>

                <div className="flex flex-shrink-0 items-center gap-1">
                  {p.login_url && (
                    <a
                      href={p.login_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Abrir enlace"
                      aria-label={`Abrir enlace de ${p.name}`}
                      className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-obsidian-muted hover:bg-obsidian-surface hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                    >
                      <ExternalLink size={14} aria-hidden="true" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (!isUnlocked) openUnlockModal();
                      else openPlatformModal(undefined, p.id);
                    }}
                    title="Editar plataforma"
                    aria-label={`Editar ${p.name}`}
                    className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-obsidian-muted hover:bg-obsidian-surface hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                  >
                    <Edit3 size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeletePlatform(p)}
                    title="Eliminar plataforma"
                    aria-label={`Eliminar ${p.name}`}
                    className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-obsidian-muted hover:bg-obsidian-surface hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-obsidian-border/60 pt-3 text-xs">
                <span
                  className="truncate font-mono text-[11px] text-obsidian-muted"
                  title={p.username || p.specific_alias || 'Sin usuario'}
                >
                  {p.username || p.specific_alias || 'Sin usuario'}
                </span>
                <SecretField value={p.password_plain} masked={p.password_masked} label="Clave" />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex min-w-0 flex-wrap items-center gap-1">
                  {p.scope === 'personal' ? (
                    <span className="inline-flex items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                      <User size={9} aria-hidden="true" />
                      <span>Personal</span>
                    </span>
                  ) : p.scope === 'shared' ? (
                    <span className="inline-flex items-center gap-1 rounded border border-purple-500/20 bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-purple-400">
                      <Users size={9} aria-hidden="true" />
                      <span>Compartido</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded border border-indigo-500/20 bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-400">
                      <Briefcase size={9} aria-hidden="true" />
                      <span>Empresa</span>
                    </span>
                  )}
                  {p.tags?.map((t, idx) => (
                    <TagBadge key={idx} name={t.name} color={t.color} />
                  ))}
                </div>
                {p.subscription_status === 'active' && (
                  <span className="flex-shrink-0 font-mono text-xs font-bold text-emerald-400">
                    {formatCost(p.subscription_cost, p.currency)} {p.currency}
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Clean Empty State */}
      {!loading && !error && filteredPlatforms.length === 0 && isUnlocked && (
        <div className="space-y-3 rounded-xl border border-obsidian-border bg-obsidian-panel px-4 py-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-400">
            <Globe size={22} aria-hidden="true" />
          </div>
          <h3 className="text-sm font-semibold text-white">
            {hasActiveFilters
              ? 'No se encontraron plataformas con los filtros seleccionados'
              : 'No hay plataformas ni servicios vinculados en este ámbito'}
          </h3>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setSelectedEmail('');
                  setSelectedStatus('');
                  setSelectedTag('');
                }}
                className="min-h-[40px] rounded-xl border border-obsidian-border bg-obsidian-surface px-3.5 py-2 text-xs font-medium text-white hover:bg-obsidian-border"
              >
                Limpiar Filtros
              </button>
            )}
            <button
              type="button"
              onClick={() => openPlatformModal()}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-500"
            >
              <Plus size={14} aria-hidden="true" />
              <span>Vincular Primera Plataforma</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
