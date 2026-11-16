import React from 'react';
import { ArrowRight, GitCompare, Search } from 'lucide-react';
import type { WriteupCorrelation } from '../../lib/writeupCorrelations';

type Props = {
  correlations: WriteupCorrelation[];
  loadedCount: number;
  totalCount: number;
  hasMore: boolean;
  loadingMore: boolean;
  onOpenReport: (reportId: string) => void;
  onLoadMore: () => void;
};

export const WriteupCorrelationsPanel: React.FC<Props> = ({
  correlations, loadedCount, totalCount, hasMore, loadingMore, onOpenReport, onLoadMore,
}) => (
  <section aria-labelledby="writeup-correlations-title" className="border-b border-slate-800 bg-slate-950/50 px-3 py-2.5 sm:px-4">
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <div className="flex min-w-0 items-center gap-2">
        <GitCompare className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
        <h2 id="writeup-correlations-title" className="text-xs font-semibold text-white">Correlaciones</h2>
        <span className="text-[11px] text-slate-400">{correlations.length} coincidencias · {loadedCount} de {totalCount} informes cargados</span>
      </div>
      {hasMore && <button type="button" onClick={onLoadMore} disabled={loadingMore} className="min-h-9 rounded-sm px-1 text-[11px] font-medium text-emerald-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-60">{loadingMore ? 'Cargando…' : 'Ampliar búsqueda'}</button>}
    </div>
    {correlations.length ? (
      <ul className="mt-2 grid min-w-0 grid-cols-1 divide-y divide-slate-800/80 sm:grid-cols-2 sm:gap-x-4 sm:divide-y-0">
        {correlations.slice(0, 6).map(({ report, reasons, evidence }) => (
          <li key={report.id} className="min-w-0 border-t border-slate-800/80 first:border-t-0 sm:border-t-0">
            <button type="button" onClick={() => onOpenReport(report.id)} className="group flex min-h-12 w-full min-w-0 items-center gap-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400">
              <Search className="h-3.5 w-3.5 shrink-0 text-slate-500 group-hover:text-emerald-300" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-100 group-hover:text-white">{report.title}</span>
                  <span className="shrink-0 rounded border border-slate-700 px-1.5 py-0.5 text-[9px] font-medium text-slate-400">
                    {evidence === 'technical' ? 'Técnica' : evidence === 'asset' ? 'Activo' : 'Contexto'}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[10px] text-slate-400">{reasons.join(' · ')}</span>
              </span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-500 group-hover:text-emerald-300" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    ) : (
      <p className="mt-2 text-xs text-slate-400">No hay coincidencias en los informes cargados. Se comparan CVE, CWE, activos y relaciones del CRM; carga más informes para ampliar el análisis.</p>
    )}
    <p className="mt-1 text-[10px] text-slate-500">Las coincidencias orientan la revisión; no afirman que los hallazgos compartan causa raíz.</p>
  </section>
);
