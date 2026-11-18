import React, { useState, useEffect, useId, useRef, useMemo } from 'react';
import {
  Mail,
  Plus,
  Smartphone,
  ExternalLink,
  Lock,
  Edit3,
  Trash2,
  Globe,
  Rocket,
  AlertTriangle,
  LoaderCircle,
  ChevronDown,
  X,
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { EmailAccount } from '../../types';
import { PlatformIcon } from '../common/PlatformIcon';
import { CopyButton } from '../common/CopyButton';
import { SecretField } from '../common/SecretField';
import { InfoTooltip } from '../common/InfoTooltip';
import { EmptyState } from '../common/EmptyState';
import { InlineErrorNotice } from '../common/InlineErrorNotice';
import { INPUT_LIMITS } from '../../lib/validation';
import { EmailDomainPosture } from './email/EmailDomainPosture';

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

  const filteredEmails = useMemo(() => emails.filter((email) => matchesScope(email.scope)), [emails, matchesScope]);
  const emailDomains = useMemo(() => Array.from(new Set(filteredEmails
    .map((email) => email.address.split('@').pop()?.trim().toLowerCase() || '')
    .filter(Boolean))), [filteredEmails]);

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
    setLoading(true);
    setLoadingMore(false);
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
    <div className="mx-auto max-w-7xl min-w-0 space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6 animate-fadeIn">
      {/* Top Header & Search */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <Mail className="flex-shrink-0 text-obsidian-muted" size={18} aria-hidden="true" />
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
            className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 text-xs text-white placeholder-obsidian-muted/60 focus:border-obsidian-accent focus:outline-none sm:w-64 sm:flex-none"
          />
          {isUnlocked && (
            <button
              type="button"
              onClick={() => openEmailModal()}
              className="ui-action-primary max-w-full"
            >{/* [Acción principal] Inicia o confirma la tarea de este espacio. */}
              <Plus size={16} aria-hidden="true" />
              <span>Nuevo correo</span>
            </button>
          )}
        </div>
      </div>

      {isUnlocked && <EmailDomainPosture domains={emailDomains} />}

      {/* Level 2 Security Alert banner if locked */}
      {!isUnlocked && (
        <div className="flex flex-col justify-between gap-3 rounded-xl border border-obsidian-border bg-obsidian-panel p-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-start gap-3 text-xs text-obsidian-text sm:items-center">
            <Lock size={16} className="mt-0.5 flex-shrink-0 text-obsidian-muted sm:mt-0" aria-hidden="true" />
            <span className="leading-relaxed">
              Bóveda bloqueada. Desbloquea con tu contraseña de acceso para crear, editar o revelar secretos.
            </span>
          </div>
          <button
            type="button"
            onClick={openUnlockModal}
            className="ui-action-primary flex-shrink-0 self-end sm:self-auto"
          >{/* [Acción principal] Inicia o confirma la tarea de este espacio. */}
            Desbloquear Bóveda
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && filteredEmails.length === 0 && (
        <div
          role="status"
          className="flex items-center justify-center gap-3 rounded-xl border border-obsidian-border bg-obsidian-panel p-6 text-xs text-obsidian-muted sm:p-8"
        >
          <LoaderCircle size={18} className="animate-spin text-obsidian-muted" aria-hidden="true" />
          <span>Cargando correos principales…</span>
        </div>
      )}

      {/* Error State */}
      {!loading && error && filteredEmails.length === 0 && (
        <EmptyState
          icon={AlertTriangle}
          tone="error"
          title="No se pudieron cargar los correos"
          description={error}
          actionLabel="Reintentar"
          onAction={() => setAttempt((value) => value + 1)}
        />
      )}

      {/* [Navegación] Correos en una lista con divisores, sin tarjetas repetidas. */}
      {loading && filteredEmails.length > 0 && (
        <p role="status" className="rounded-lg border border-obsidian-border bg-obsidian-panel px-3 py-2 text-xs text-obsidian-muted">
          Actualizando. Se conserva la última lista cargada; puede no corresponder a la búsqueda actual.
        </p>
      )}

      {!loading && error && filteredEmails.length > 0 && (
        <InlineErrorNotice
          title="No se pudieron actualizar los correos"
          description={`${error} La lista visible puede corresponder a una búsqueda anterior.`}
          actionLabel="Reintentar"
          onAction={() => setAttempt((value) => value + 1)}
        />
      )}

      {filteredEmails.length > 0 && (
        <div className="divide-y divide-obsidian-border border-y border-obsidian-border">
          {filteredEmails.map((email) => (
            <article
              key={email.id}
              className="group flex min-w-0 flex-col gap-3 py-4"
            >
              {/* Upper part */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => openInspector('email', email.id)}
                    aria-label={`Ver detalles de ${email.address}`}
                    className="ui-nav-action min-w-0 flex-1 items-center gap-3"
                  >{/* [Navegación] Mantiene disponible esta acción en su contexto. */}
                    <PlatformIcon name={email.provider} size="md" />
                    <div className="min-w-0 flex-1">
                      <h3
                        className="truncate text-sm font-bold text-obsidian-text"
                        title={email.address}
                      >
                        {email.address}
                      </h3>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-obsidian-muted">
                        <span className="truncate">{email.provider}</span>

                      </div>
                    </div>
                  </button>

                  <div className="flex flex-shrink-0 items-center gap-1">
                    <CopyButton
                      value={email.address}
                      label="Dirección de correo"
                      className="min-h-[44px] min-w-[44px]"
                    />
                    {email.inbox_url && (
                      <a
                        href={email.inbox_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Abrir bandeja de entrada (Webmail)"
                        aria-label={`Abrir bandeja de entrada de ${email.address}`}
                        className="ui-action-icon"
                      >
                        {/* [Icono] Abre la bandeja de entrada en otra pestaña. */}
                        <ExternalLink size={16} aria-hidden="true" />
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
                      className="ui-action-icon"
                    >{/* [Icono] Acción identificada por su nombre accesible. */}
                      <Edit3 size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteEmail(email)}
                      title="Eliminar cuenta de correo"
                      aria-label={`Eliminar ${email.address}`}
                      className="ui-action-icon ui-action-danger"
                    >{/* [Acción destructiva] Envía el elemento a la papelera. */}
                      <Trash2 size={16} aria-hidden="true" />
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
                        className="flex min-w-0 max-w-full items-center gap-2 text-obsidian-text"
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
                        <Smartphone size={16} className="flex-shrink-0 text-obsidian-muted" aria-hidden="true" />
                        <span className="truncate font-mono">{email.recovery_phone}</span>
                      </div>
                    )}
                  </div>

                  <details className="min-w-0 shrink-0">
                    {/* [Menú y selector] Agrupa las formas de vincular esta cuenta. */}
                    <summary data-caret="manual" className="ui-action-secondary cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                      <Plus size={16} aria-hidden="true" />
                      <span>Vincular</span>
                      <ChevronDown size={16} aria-hidden="true" />
                    </summary>
                    <div className="mt-1 flex max-w-full flex-wrap gap-2 border-t border-obsidian-border/60 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (!isUnlocked) openUnlockModal();
                          else openPlatformModal(email.id);
                        }}
                        className="ui-menu-item"
                      >
                        <Globe size={16} className="text-obsidian-muted" aria-hidden="true" />
                        <span>Cuenta o servicio</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!isUnlocked) openUnlockModal();
                          else openProspectModal(email.id);
                        }}
                        className="ui-menu-item"
                      >
                        <Rocket size={16} className="text-obsidian-muted" aria-hidden="true" />
                        <span>Prospecto</span>
                      </button>
                    </div>
                  </details>
                </div>
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
            className="ui-action-secondary"
          >{/* [Acción secundaria] Ejecuta la operación de apoyo en este espacio. */}
            {loadingMore && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
            {loadingMore ? 'Cargando…' : loadMoreError ? 'Reintentar carga' : 'Cargar más'}
          </button>
        </div>
      )}

      {/* Clean Empty State */}
      {!loading && !error && isUnlocked && filteredEmails.length === 0 && (
        <div role="status" className="space-y-3 rounded-xl border border-obsidian-border bg-obsidian-panel px-4 py-8 text-center">
          <Mail size={18} className="mx-auto text-obsidian-muted" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-white">
            {search
              ? 'No se encontraron correos con esta búsqueda'
              : 'No hay correos principales para esta selección'}
          </h3>
          {search && (
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setSearch('')}
                className="ui-action-secondary items-center gap-2"
              >{/* [Acción secundaria] Restablece el filtro de búsqueda. */}
                <X size={16} aria-hidden="true" />
                Limpiar búsqueda
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
