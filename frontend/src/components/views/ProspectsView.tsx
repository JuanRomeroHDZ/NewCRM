import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Briefcase,
  Clock,
  DollarSign,
  LoaderCircle,
  MapPinned,
  MessageCircle,
  Phone,
  Plus,
  Search,
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { getSlaBadgeMeta, getStatusMeta, PROSPECT_STATUS_OPTIONS } from '../../lib/prospectUtils';
import { INPUT_LIMITS } from '../../lib/validation';
import { EmptyState } from '../common/EmptyState';
import type { Prospect } from '../../types';

export const ProspectsView: React.FC = () => {
  const {
    setActiveSection,
    isUnlocked,
    openUnlockModal,
    openProspectModal,
    openInspector,
    dataVersion,
    matchesScope,
    supportedCurrencies,
    baseCurrency,
    systemLocale,
  } = useVault();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('todos');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loadMoreError, setLoadMoreError] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const requestVersion = useRef(0);
  const nextOffset = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!isUnlocked) {
      requestVersion.current += 1;
      nextOffset.current = 0;
      setProspects([]);
      setTotal(0);
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
    setProspects([]);
    setTotal(0);
    setHasMore(false);
    setLoadMoreError('');
    setError('');
    api
      .getProspectsPage({
        status: status === 'todos' ? undefined : status,
        search: debouncedSearch || undefined,
        limit: 50,
        offset: 0,
      })
      .then((page) => {
        if (active && version === requestVersion.current) {
          setProspects(page.items);
          setTotal(page.total);
          setHasMore(page.hasMore);
          nextOffset.current = page.items.length;
        }
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof Error && err.message
              ? err.message
              : 'No se pudieron cargar los prospectos. Vuelve a intentarlo.'
          );
        }
      })
      .finally(() => {
        if (active && version === requestVersion.current) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isUnlocked, dataVersion, attempt, status, debouncedSearch]);

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;
    const version = requestVersion.current;
    setLoadingMore(true);
    setLoadMoreError('');
    try {
      const page = await api.getProspectsPage({
        status: status === 'todos' ? undefined : status,
        search: debouncedSearch || undefined,
        limit: 50,
        offset: nextOffset.current,
      });
      if (version !== requestVersion.current) return;
      nextOffset.current += page.items.length;
      setProspects((current) => {
        const knownIds = new Set(current.map((prospect) => prospect.id));
        return [...current, ...page.items.filter((prospect) => !knownIds.has(prospect.id))];
      });
      setTotal(page.total);
      setHasMore(page.hasMore);
    } catch (err) {
      if (version === requestVersion.current) {
        setLoadMoreError(err instanceof Error ? err.message : 'No se pudieron cargar más prospectos.');
      }
    } finally {
      if (version === requestVersion.current) setLoadingMore(false);
    }
  };

  const visibleProspects = useMemo(() => {
    return prospects.filter((prospect) => matchesScope(prospect.scope));
  }, [prospects, matchesScope]);

  const formatEstimatedValue = (amount?: number, currencyCode?: string) => {
    const code = currencyCode || baseCurrency;
    const symbol = supportedCurrencies.find((c) => c.code === code)?.symbol || '$';
    const formatted = Number(amount || 0).toLocaleString(systemLocale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    return `${symbol}${formatted} ${code}`;
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-3 sm:space-y-5 sm:p-6 lg:p-8">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <Briefcase size={19} className="mt-1 shrink-0 text-indigo-300" aria-hidden="true" />
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight text-white sm:text-xl">Prospectos</h1>
            <p className="mt-0.5 text-xs text-obsidian-muted">Oportunidades y seguimiento.</p>
          </div>
        </div>
        <div className="flex max-w-full flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveSection('capture')}
            className="inline-flex min-h-10 max-w-full items-center justify-center gap-2 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 text-xs font-semibold text-obsidian-text transition-colors hover:border-indigo-500/40 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
          >
            <MapPinned size={15} className="text-indigo-300" aria-hidden="true" /> Captar en mapa
          </button>
          <button
            type="button"
            onClick={() => (isUnlocked ? openProspectModal() : openUnlockModal())}
            className="inline-flex min-h-10 max-w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
          >
            <Plus size={15} aria-hidden="true" /> Nuevo prospecto
          </button>
        </div>
      </header>

      <section aria-labelledby="prospectos-lista" className="overflow-hidden rounded-2xl border border-obsidian-border bg-obsidian-card">
        <div className="border-b border-obsidian-border p-3 sm:p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-1">
            <h2 id="prospectos-lista" className="text-base font-semibold text-white">
              Seguimiento
            </h2>
            <p aria-live="polite" className="text-xs text-obsidian-muted">
              {visibleProspects.length} {visibleProspects.length === 1 ? 'prospecto visible' : 'prospectos visibles'}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.45fr)]">
            <label className="min-w-0 text-xs font-medium text-obsidian-muted">
              Buscar
              <span className="relative mt-1.5 block">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-obsidian-muted"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  maxLength={INPUT_LIMITS.SEARCH}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Empresa, contacto, correo, teléfono o sitio web"
                  aria-label="Buscar prospectos por empresa, contacto, correo, teléfono o sitio web"
                  className="min-h-11 w-full rounded-xl border border-obsidian-border bg-obsidian-bg pl-9 pr-3 text-sm text-white placeholder:text-obsidian-muted focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </span>
            </label>
            <label className="min-w-0 text-xs font-medium text-obsidian-muted">
              Etapa
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-obsidian-border bg-obsidian-bg px-3 text-sm text-white focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="todos">Todas las etapas</option>
                {PROSPECT_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {!isUnlocked ? (
          <div className="p-5 text-sm text-obsidian-muted">
            Desbloquea la bóveda para consultar tus prospectos.{' '}
            <button
              type="button"
              onClick={openUnlockModal}
              className="text-indigo-300 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
            >
              Desbloquear
            </button>
          </div>
        ) : loading ? (
          <div role="status" className="flex items-center gap-2.5 p-6 text-sm text-obsidian-muted">
            <LoaderCircle size={18} className="animate-spin text-indigo-300" aria-hidden="true" />
            <span>Cargando prospectos…</span>
          </div>
        ) : error ? (
          <div className="p-4 sm:p-5">
            <EmptyState
              icon={AlertTriangle}
              tone="error"
              title="Error al cargar prospectos"
              description={error}
              actionLabel="Reintentar"
              onAction={() => setAttempt((value) => value + 1)}
            />
          </div>
        ) : visibleProspects.length === 0 ? (
          <div className="flex flex-col items-start gap-3 p-5 sm:p-7">
            <p className="text-sm text-obsidian-muted">
              {total > 0
                ? 'No hay prospectos visibles que coincidan con esta selección.'
                : search.trim() || status !== 'todos'
                  ? 'No hay prospectos que coincidan con los filtros.'
                  : 'Todavía no hay prospectos en tu seguimiento.'}
            </p>
            {total === 0 && !search.trim() && status === 'todos' && (
              <button
                type="button"
                onClick={() => setActiveSection('capture')}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-indigo-500/25 bg-indigo-500/10 px-3 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
              >
                <MapPinned size={14} aria-hidden="true" />
                Buscar negocios en el mapa
                <ArrowUpRight size={13} aria-hidden="true" />
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-obsidian-border" aria-label="Lista de prospectos">
            {visibleProspects.map((prospect) => {
              const statusMeta = getStatusMeta(prospect.status);
              const slaMeta = getSlaBadgeMeta(prospect.sla_status);
              const contactPreview = prospect.whatsapp || prospect.phones;
              const followupCount = prospect.followup_count ?? 0;
              const maxFollowups = prospect.max_followup_attempts ?? 3;

              return (
                <li key={prospect.id}>
                  <button
                    type="button"
                    onClick={() => openInspector('prospect', prospect.id)}
                    className="flex min-h-[76px] w-full flex-col gap-2.5 px-4 py-3.5 text-left transition-colors hover:bg-obsidian-surface/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <span className="block break-words text-sm font-medium text-white">
                        {prospect.company_name}
                      </span>
                      <span className="block break-words text-xs text-obsidian-muted">
                        {prospect.contact_name || prospect.contact_email || 'Sin contacto registrado'}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[11px]">
                        {(prospect.estimated_value || 0) > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 font-mono font-semibold text-emerald-300">
                            <DollarSign size={10} aria-hidden="true" />
                            <span>{formatEstimatedValue(prospect.estimated_value, prospect.currency)}</span>
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 rounded-md border border-obsidian-border bg-obsidian-surface px-2 py-0.5 text-obsidian-text">
                          <Clock size={10} className="text-indigo-300" aria-hidden="true" />
                          <span>
                            Seguimientos: {followupCount}/{maxFollowups}
                          </span>
                        </span>
                        {contactPreview && (
                          <span className="inline-flex max-w-full items-center gap-1 truncate rounded-md border border-obsidian-border bg-obsidian-bg px-2 py-0.5 font-mono text-obsidian-muted">
                            {prospect.whatsapp ? (
                              <MessageCircle size={10} className="shrink-0 text-emerald-400" aria-hidden="true" />
                            ) : (
                              <Phone size={10} className="shrink-0 text-cyan-400" aria-hidden="true" />
                            )}
                            <span className="truncate">{contactPreview}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${slaMeta.badgeClass}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${slaMeta.dotClass}`} aria-hidden="true" />
                        <span>{slaMeta.shortLabel}</span>
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ${statusMeta.badgeClass}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dotClass}`} aria-hidden="true" />
                        <span>{statusMeta.label}</span>
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {isUnlocked && !loading && !error && hasMore && (
          <div className="flex flex-col items-center gap-2 border-t border-obsidian-border p-3">
            {loadMoreError && <p role="alert" className="text-center text-xs text-rose-300">{loadMoreError}</p>}
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
              aria-label="Cargar más prospectos"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-obsidian-border bg-obsidian-surface px-4 text-xs font-semibold text-obsidian-text transition-colors hover:border-indigo-400/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 disabled:cursor-wait disabled:opacity-60"
            >
              {loadingMore && <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />}
              {loadingMore ? 'Cargando…' : loadMoreError ? 'Reintentar carga' : 'Cargar más'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
