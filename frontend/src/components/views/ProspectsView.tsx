import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Briefcase, MapPinned, Plus, Search } from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { getStatusMeta, PROSPECT_STATUS_OPTIONS } from '../../lib/prospectUtils';
import type { Prospect } from '../../types';

export const ProspectsView: React.FC = () => {
  const {
    setActiveSection, isUnlocked, openUnlockModal, openProspectModal,
    openInspector, dataVersion, matchesScope,
  } = useVault();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('todos');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isUnlocked) {
      setProspects([]);
      setError('');
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError('');
    api.getProspects()
      .then((items) => { if (active) setProspects(items); })
      .catch(() => { if (active) setError('No se pudieron cargar los prospectos. Vuelve a intentarlo.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isUnlocked, dataVersion, attempt]);

  const visibleProspects = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return prospects.filter((prospect) => {
      const text = [prospect.company_name, prospect.contact_name, prospect.contact_email]
        .filter(Boolean).join(' ').toLocaleLowerCase();
      return matchesScope(prospect.scope)
        && (status === 'todos' || prospect.status === status)
        && (!term || text.includes(term));
    });
  }, [prospects, search, status, matchesScope]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-3 sm:space-y-5 sm:p-6 lg:p-8">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <Briefcase size={19} className="mt-1 shrink-0 text-indigo-300" />
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight text-white sm:text-xl">Prospectos</h1>
            <p className="mt-0.5 text-xs text-obsidian-muted">Oportunidades y seguimiento.</p>
          </div>
        </div>
        <div className="flex max-w-full flex-wrap gap-2">
          <button type="button" onClick={() => setActiveSection('capture')} className="inline-flex min-h-10 max-w-full items-center justify-center gap-2 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 text-xs font-semibold text-obsidian-text transition-colors hover:border-indigo-500/40 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">
            <MapPinned size={15} className="text-indigo-300" /> Captar en mapa
          </button>
          <button type="button" onClick={() => isUnlocked ? openProspectModal() : openUnlockModal()} className="inline-flex min-h-10 max-w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">
            <Plus size={15} /> Nuevo prospecto
          </button>
        </div>
      </header>

      <section aria-labelledby="prospectos-lista" className="overflow-hidden rounded-2xl border border-obsidian-border bg-obsidian-card">
        <div className="border-b border-obsidian-border p-3 sm:p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-1">
            <h2 id="prospectos-lista" className="text-base font-semibold text-white">Seguimiento</h2>
            <p className="text-xs text-obsidian-muted">{visibleProspects.length} prospectos</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.45fr)]">
            <label className="min-w-0 text-xs font-medium text-obsidian-muted">
              Buscar
              <span className="relative mt-1.5 block">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-obsidian-muted" />
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Empresa, contacto o correo" className="min-h-11 w-full rounded-xl border border-obsidian-border bg-obsidian-bg pl-9 pr-3 text-sm text-white placeholder:text-obsidian-muted focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
              </span>
            </label>
            <label className="min-w-0 text-xs font-medium text-obsidian-muted">
              Etapa
              <select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-obsidian-border bg-obsidian-bg px-3 text-sm text-white focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                <option value="todos">Todas las etapas</option>
                {PROSPECT_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
        </div>

        {!isUnlocked ? (
          <div className="p-5 text-sm text-obsidian-muted">
            Desbloquea la bóveda para consultar tus prospectos.{' '}
            <button type="button" onClick={openUnlockModal} className="text-indigo-300 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">Desbloquear</button>
          </div>
        ) : loading ? (
          <p role="status" className="p-5 text-sm text-obsidian-muted">Cargando prospectos…</p>
        ) : error ? (
          <div role="alert" className="flex flex-col gap-3 p-5 text-sm text-rose-200 sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            <button type="button" onClick={() => setAttempt((value) => value + 1)} className="min-h-10 w-fit rounded-lg border border-rose-500/30 px-3 text-xs font-semibold hover:bg-rose-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-300">Reintentar</button>
          </div>
        ) : visibleProspects.length === 0 ? (
          <div className="flex flex-col items-start gap-3 p-5 sm:p-7">
            <p className="text-sm text-obsidian-muted">{prospects.length ? 'No hay prospectos que coincidan con los filtros.' : 'Todavía no hay prospectos en tu seguimiento.'}</p>
            {!prospects.length && <button type="button" onClick={() => setActiveSection('capture')} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-indigo-500/25 bg-indigo-500/10 px-3 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"><MapPinned size={14} />Buscar negocios en el mapa<ArrowUpRight size={13} /></button>}
          </div>
        ) : (
          <ul className="divide-y divide-obsidian-border" aria-label="Lista de prospectos">
            {visibleProspects.map((prospect) => {
              const statusMeta = getStatusMeta(prospect.status);
              return <li key={prospect.id}>
                <button type="button" onClick={() => openInspector('prospect', prospect.id)} className="flex min-h-[68px] w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-obsidian-surface/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400 sm:px-5">
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-medium text-white">{prospect.company_name}</span>
                    <span className="mt-0.5 block break-words text-xs text-obsidian-muted">{prospect.contact_name || prospect.contact_email || 'Sin contacto registrado'}</span>
                  </span>
                  <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ${statusMeta.badgeClass}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dotClass}`} />{statusMeta.label}
                  </span>
                </button>
              </li>;
            })}
          </ul>
        )}
      </section>
    </div>
  );
};
