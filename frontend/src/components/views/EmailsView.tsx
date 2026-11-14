import React, { useState, useEffect, useId, useRef } from 'react';
import {
  Mail,
  Plus,
  ArrowRight,
  Smartphone,
  ExternalLink,
  Lock,
  Edit3,
  Trash2,
  Globe,
  Rocket,
  Briefcase,
  User,
  Users,
  AlertTriangle,
  LoaderCircle,
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { EmailAccount } from '../../types';
import { PlatformIcon } from '../common/PlatformIcon';
import { CopyButton } from '../common/CopyButton';
import { SecretField } from '../common/SecretField';
import { InfoTooltip } from '../common/InfoTooltip';
import { EmptyState } from '../common/EmptyState';
import { INPUT_LIMITS } from '../../lib/validation';

export const EmailsView: React.FC = () => {
  const {
    openInspector,
    openEmailModal,
    openPlatformModal,
    openProspectModal,
    openUnlockModal,
    isUnlocked,
    showToast,
    triggerDataReload,
    dataVersion,
    matchesScope,
    confirm,
  } = useVault();

  const searchInputId = useId();
  const [emails, setEmails] = useState<EmailAccount[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const requestVersion = useRef(0);
  const nextOffset = useRef(0);

  const filteredEmails = emails.filter((email) => matchesScope(email.scope));

  useEffect(() => {
    if (!isUnlocked) {
      requestVersion.current += 1;
      nextOffset.current = 0;
      setEmails([]);
      setHasMore(false);
      setLoadingMore(false);
      setLoadMoreError('');
      setError('');
      setLoading(false);
      return;
    }
    let active = true;
    const version = ++requestVersion.current;
    nextOffset.current = 0;
    setLoading(true);
    setLoadingMore(false);
    setEmails([]);
    setHasMore(false);
    setLoadMoreError('');
    setError('');
    api
      .getEmailsPage({ search: search.trim() || undefined, limit: 50, offset: 0 })
      .then((page) => {
        if (active && version === requestVersion.current) {
          setEmails(page.items);
          setHasMore(page.hasMore);
          nextOffset.current = page.items.length;
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'No se pudieron cargar los correos.');
        }
      })
      .finally(() => {
        if (active && version === requestVersion.current) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [search, isUnlocked, dataVersion, attempt]);

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;
    const version = requestVersion.current;
    setLoadingMore(true);
    setLoadMoreError('');
    try {
      const page = await api.getEmailsPage({
        search: search.trim() || undefined,
        limit: 50,
        offset: nextOffset.current,
      });
      if (version !== requestVersion.current) return;
      nextOffset.current += page.items.length;
      setEmails((current) => {
        const knownIds = new Set(current.map((email) => email.id));
        return [...current, ...page.items.filter((email) => !knownIds.has(email.id))];
      });
      setHasMore(page.hasMore);
    } catch (err) {
      if (version === requestVersion.current) {
        setLoadMoreError(err instanceof Error ? err.message : 'No se pudieron cargar más correos.');
      }
    } finally {
      if (version === requestVersion.current) setLoadingMore(false);
    }
  };

  const handleDeleteEmail = async (email: EmailAccount) => {
    if (!isUnlocked) {
      openUnlockModal();
      return;
    }
    const accepted = await confirm({
      title: 'Enviar correo a la papelera',
      message: `¿Enviar la cuenta de correo "${email.address}" a la papelera?`,
      confirmLabel: 'Enviar a papelera',
      tone: 'danger',
    });
    if (!accepted) return;

    try {
      await api.deleteEmail(email.id);
      showToast(`Correo "${email.address}" enviado a la papelera.`, 'info');
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message || 'No se pudo eliminar el correo.', 'error');
    }
  };

  return (
    <div className="mx-auto max-w-7xl min-w-0 space-y-4 p-3 sm:space-y-6 sm:p-8 animate-fadeIn">
      {/* Top Header & Search */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <Mail className="flex-shrink-0 text-indigo-400" size={18} aria-hidden="true" />
          <h2 aria-live="polite" className="truncate text-base font-bold tracking-tight text-white">
            Correos Principales ({filteredEmails.length})
          </h2>
          <InfoTooltip
            title="Correos Principales"
            content="Cuentas de correo desde las que administras tus servicios, suscripciones, correos de respaldo y prospectos."
          />
        </div>

        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
          <label htmlFor={searchInputId} className="sr-only">
            Buscar correos por dirección o proveedor
          </label>
          <input
            id={searchInputId}
            type="search"
            maxLength={INPUT_LIMITS.SEARCH}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por dirección o proveedor..."
            aria-label="Buscar por dirección o proveedor"
            className="min-h-10 min-w-0 flex-1 rounded-lg border border-obsidian-border bg-obsidian-panel px-3 text-xs text-white placeholder-obsidian-muted/60 focus:border-indigo-500 focus:outline-none sm:w-64 sm:flex-none"
          />
          {isUnlocked && (
            <button
              type="button"
              onClick={() => openEmailModal()}
              className="inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-left text-xs font-semibold text-white transition-colors hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <Plus size={14} aria-hidden="true" />
              <span>Nuevo correo</span>
            </button>
          )}
        </div>
      </div>

      {/* Level 2 Security Alert banner if locked */}
      {!isUnlocked && (
        <div className="flex flex-col justify-between gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-start gap-3 text-xs text-amber-200 sm:items-center">
            <Lock size={16} className="mt-0.5 flex-shrink-0 text-amber-400 sm:mt-0" aria-hidden="true" />
            <span className="leading-relaxed">
              Bóveda bloqueada. Desbloquea con tu contraseña de acceso para crear, editar o revelar secretos.
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

      {/* Loading State */}
      {loading && (
        <div
          role="status"
          className="flex items-center justify-center gap-2.5 rounded-2xl border border-obsidian-border bg-obsidian-panel p-8 text-xs text-obsidian-muted"
        >
          <LoaderCircle size={18} className="animate-spin text-indigo-400" aria-hidden="true" />
          <span>Cargando correos principales…</span>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <EmptyState
          icon={AlertTriangle}
          tone="error"
          title="No se pudieron cargar los correos"
          description={error}
          actionLabel="Reintentar"
          onAction={() => setAttempt((value) => value + 1)}
        />
      )}

      {/* Emails Cards Grid */}
      {!loading && !error && filteredEmails.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filteredEmails.map((email) => (
            <article
              key={email.id}
              className="group flex min-w-0 flex-col justify-between gap-3 overflow-hidden rounded-xl border border-obsidian-border bg-obsidian-panel p-3 transition-colors hover:border-obsidian-borderLight sm:p-4"
            >
              {/* Upper part */}
              <div className="min-w-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => openInspector('email', email.id)}
                    aria-label={`Ver detalles de ${email.address}`}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                  >
                    <PlatformIcon name={email.provider} size="md" />
                    <div className="min-w-0 flex-1">
                      <h3
                        className="truncate text-sm font-bold text-white transition-colors group-hover:text-indigo-300"
                        title={email.address}
                      >
                        {email.address}
                      </h3>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-obsidian-muted">
                        <span className="truncate">{email.provider}</span>
                        <span aria-hidden="true">•</span>
                        <span className="font-semibold text-indigo-400">{email.platform_count} plataforma(s)</span>
                        <span aria-hidden="true">•</span>
                        <span className="font-semibold text-cyan-400">{email.prospect_count || 0} prospecto(s)</span>
                        <span aria-hidden="true">•</span>
                        {email.scope === 'personal' ? (
                          <span className="inline-flex items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                            <User size={9} aria-hidden="true" />
                            <span>Personal</span>
                          </span>
                        ) : email.scope === 'shared' ? (
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
                      </div>
                    </div>
                  </button>

                  <div className="flex flex-shrink-0 items-center gap-1">
                    <CopyButton
                      value={email.address}
                      label="Dirección de correo"
                      className="min-h-[36px] min-w-[36px]"
                    />
                    {email.inbox_url && (
                      <a
                        href={email.inbox_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Abrir bandeja de entrada (Webmail)"
                        aria-label={`Abrir bandeja de entrada de ${email.address}`}
                        className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-obsidian-muted transition-colors hover:bg-obsidian-surface hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                      >
                        <ExternalLink size={14} aria-hidden="true" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (!isUnlocked) openUnlockModal();
                        else openEmailModal(email.id);
                      }}
                      title="Editar cuenta de correo"
                      aria-label={`Editar ${email.address}`}
                      className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-obsidian-muted transition-colors hover:bg-obsidian-surface hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                    >
                      <Edit3 size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteEmail(email)}
                      title="Eliminar cuenta de correo"
                      aria-label={`Eliminar ${email.address}`}
                      className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-obsidian-muted transition-colors hover:bg-obsidian-surface hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* Middle Credential / Password bar */}
                <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-obsidian-border/60 pt-3 text-xs">
                  <span className="flex-shrink-0 text-obsidian-muted">Contraseña:</span>
                  <SecretField value={email.password_plain} masked={email.password_masked} label="Contraseña" />
                </div>

                {/* Recovery chain & Quick Correlation Actions */}
                <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2 text-[11px]">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    {email.recovery_email_address ? (
                      <div
                        className="flex min-w-0 max-w-full items-center gap-1.5 text-cyan-300"
                        title={`Recupera a: ${email.recovery_email_address}`}
                      >
                        <span className="flex-shrink-0 text-obsidian-muted">Recupera:</span>
                        <strong className="truncate font-mono">{email.recovery_email_address}</strong>
                      </div>
                    ) : (
                      <div className="text-obsidian-muted">Sin correo de respaldo</div>
                    )}

                    {email.recovery_phone && (
                      <div className="flex min-w-0 max-w-full items-center gap-1 text-obsidian-text">
                        <Smartphone size={12} className="flex-shrink-0 text-obsidian-muted" aria-hidden="true" />
                        <span className="truncate font-mono">{email.recovery_phone}</span>
                      </div>
                    )}
                  </div>

                  <details className="min-w-0 shrink-0">
                    <summary className="flex min-h-[34px] cursor-pointer list-none items-center gap-1.5 rounded-lg border border-obsidian-border bg-obsidian-surface px-2.5 py-1 text-[10px] font-medium text-obsidian-text hover:bg-obsidian-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 [&::-webkit-details-marker]:hidden">
                      <Plus size={12} aria-hidden="true" />
                      <span>Vincular</span>
                    </summary>
                    <div className="mt-1 flex max-w-full flex-wrap gap-1.5 border-t border-obsidian-border/60 pt-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (!isUnlocked) openUnlockModal();
                          else openPlatformModal(email.id);
                        }}
                        className="inline-flex min-h-[36px] items-center gap-2 rounded-md px-2 text-left text-xs text-obsidian-text hover:bg-obsidian-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                      >
                        <Globe size={13} className="text-indigo-400" aria-hidden="true" />
                        <span>Cuenta o servicio</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!isUnlocked) openUnlockModal();
                          else openProspectModal(email.id);
                        }}
                        className="inline-flex min-h-[36px] items-center gap-2 rounded-md px-2 text-left text-xs text-obsidian-text hover:bg-obsidian-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                      >
                        <Rocket size={13} className="text-indigo-400" aria-hidden="true" />
                        <span>Prospecto</span>
                      </button>
                    </div>
                  </details>
                </div>
              </div>

              {/* Bottom info footer */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-obsidian-border/60 pt-3 text-[11px] text-obsidian-muted">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      email.two_factor_method !== 'none'
                        ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                        : 'border border-rose-500/20 bg-rose-500/10 text-rose-400'
                    }`}
                  >
                    {email.two_factor_method === 'none'
                      ? 'Sin verificación en dos pasos'
                      : 'Verificación en dos pasos activa'}
                  </span>

                  {email.backup_codes && email.backup_codes.length > 0 && (
                    <span>{email.backup_codes.length} Códigos de Respaldo</span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => openInspector('email', email.id)}
                  aria-label={`Abrir detalles de ${email.address}`}
                  className="inline-flex min-h-[32px] flex-shrink-0 items-center gap-1 rounded-lg px-2 text-obsidian-muted transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                >
                  <span>Ver detalles</span>
                  <ArrowRight size={13} aria-hidden="true" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {!loading && !error && hasMore && (
        <div className="flex flex-col items-center gap-2 py-2">
          {loadMoreError && <p role="alert" className="text-center text-xs text-rose-300">{loadMoreError}</p>}
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            aria-label="Cargar más correos"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-obsidian-border bg-obsidian-panel px-4 text-xs font-semibold text-obsidian-text transition-colors hover:border-indigo-400/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-wait disabled:opacity-60"
          >
            {loadingMore && <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />}
            {loadingMore ? 'Cargando…' : loadMoreError ? 'Reintentar carga' : 'Cargar más'}
          </button>
        </div>
      )}

      {/* Clean Empty State */}
      {!loading && !error && isUnlocked && filteredEmails.length === 0 && (
        <EmptyState
          icon={Mail}
          title={
            search
              ? 'No se encontraron correos con esa búsqueda'
              : 'No hay correos principales para esta selección'
          }
        />
      )}
    </div>
  );
};
