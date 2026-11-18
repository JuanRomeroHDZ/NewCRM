import React from 'react';
import { ArrowRight, GitCompare } from 'lucide-react';
import type { WriteupCorrelation } from '../../lib/writeupCorrelations';

type Props = {
  correlations: WriteupCorrelation[];
  loadedCount: number;
  totalCount: number;
  hasMore: boolean;
  loadingMore: boolean;
  onOpenReport: (reportId: string, reasons: string[]) => void;
  onLoadMore: () => void;
};

export const WriteupCorrelationsPanel: React.FC<Props> = ({
  correlations, loadedCount, totalCount, hasMore, loadingMore, onOpenReport, onLoadMore,
}) => (
  <section aria-labelledby="writeup-correlations-title" className="border-b border-obsidian-border px-3 py-2">
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <div className="flex min-w-0 items-center gap-2">
        <GitCompare className="h-4 w-4 shrink-0 text-obsidian-muted" aria-hidden="true" />
        <h2 id="writeup-correlations-title" className="text-xs font-semibold text-white">Correlaciones</h2>
        <span className="text-[11px] text-obsidian-muted">{correlations.length} coincidencias · {loadedCount} de {totalCount} informes cargados</span>
      </div>
      {hasMore && <button type="button" onClick={onLoadMore} disabled={loadingMore} className="ui-action-secondary">{loadingMore ? 'Cargando…' : 'Ampliar búsqueda'}</button>}
    </div>
    {correlations.length ? (
      <div className="mt-2 max-h-72 overflow-y-auto divide-y divide-obsidian-border">
        {([['technical', 'Identificadores técnicos'], ['asset', 'Activos compartidos'], ['context', 'Contexto del proyecto o cliente']] as const).map(([kind, label]) => {
          const group = correlations.filter(correlation => correlation.evidence === kind);
          if (!group.length) return null;
          return <section key={kind} className="py-2">
            <h3 className="text-xs font-medium text-obsidian-muted">{label} ({group.length})</h3>
            <ul className="divide-y divide-obsidian-border">
              {group.map(({ report, reasons }) => <li key={report.id}>
                {/* [Navegación] Abre el informe y conserva la razón de la coincidencia. */}
                <button type="button" onClick={() => onOpenReport(report.id, reasons)} className="ui-nav-action w-full min-w-0 py-2 text-left">
                  <span className="min-w-0 flex-1 break-words">
                    <span className="block text-xs font-medium text-obsidian-text">{report.title}</span>
                    <span className="mt-0.5 block text-xs text-obsidian-muted">{reasons.join(' · ')}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </button>
              </li>)}
            </ul>
          </section>;
        })}
      </div>
    ) : (
      <p className="mt-2 text-xs text-obsidian-muted">No hay coincidencias en los informes cargados.</p>
    )}
    {correlations.length > 0 && <p className="mt-1 text-xs text-obsidian-muted">Confirma cada coincidencia antes de atribuirle una causa común.</p>}
  </section>
);
