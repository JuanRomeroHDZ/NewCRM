import React from 'react';
import { ArrowDownRight, ArrowUpRight, CalendarRange, Info } from 'lucide-react';
import type { CashflowForecast } from '../../../lib/cashflowForecast';

type Props = {
  forecast: CashflowForecast;
  formatAmount: (value: number | string | null | undefined, decimals?: number) => string;
  onOpenFinance: () => void;
};

export const DashboardForecastSection: React.FC<Props> = ({ forecast, formatAmount, onOpenFinance }) => {
  const intervals = [
    { label: '30 días', incoming: forecast.inflow30MXN, outgoing: forecast.outflow30MXN },
    { label: '60 días', incoming: forecast.inflow60MXN, outgoing: forecast.outflow60MXN },
    { label: '90 días', incoming: forecast.inflow90MXN, outgoing: forecast.outflow90MXN },
  ];
  const upcoming = forecast.events.slice(0, 4);

  return (
    <section aria-labelledby="dashboard-cashflow-heading" className="min-w-0 rounded-xl border border-obsidian-border bg-obsidian-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarRange size={16} className="shrink-0 text-emerald-300" aria-hidden="true" />
          <h2 id="dashboard-cashflow-heading" className="text-sm font-bold text-white">Flujo previsto</h2>
          <span className="text-xs text-obsidian-muted">90 días</span>
        </div>
        <button type="button" onClick={onOpenFinance} className="min-h-9 rounded-sm text-xs font-medium text-emerald-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">Abrir finanzas</button>
      </div>
      <p className="mt-1 text-[11px] text-obsidian-muted">Montos en MXN. Estimación con movimientos fechados; las igualas recurrentes se repiten mensualmente.</p>

      <div className="mt-3 grid grid-cols-3 divide-x divide-obsidian-border border-y border-obsidian-border py-2">
        {intervals.map((interval) => {
          const net = interval.incoming - interval.outgoing;
          return (
            <div key={interval.label} className="min-w-0 px-2 first:pl-0 last:pr-0">
              <h3 className="text-[11px] font-semibold text-obsidian-muted">{interval.label}</h3>
              <p className={`mt-1 truncate text-xs font-mono font-semibold tabular-nums ${net >= 0 ? 'text-emerald-300' : 'text-rose-300'}`} title={`Neto previsto: ${formatAmount(net)} MXN`}>
                {net >= 0 ? '+' : '−'}${formatAmount(Math.abs(net), 0)}
              </p>
              <p className="mt-1 truncate text-[10px] text-obsidian-muted">Entra ${formatAmount(interval.incoming, 0)}</p>
              <p className="truncate text-[10px] text-obsidian-muted">Sale ${formatAmount(interval.outgoing, 0)}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-2">
        <h3 className="text-[11px] font-semibold text-white">Próximos movimientos</h3>
        {upcoming.length ? (
          <ul className="mt-1 divide-y divide-obsidian-border/70">
            {upcoming.map((event) => (
              <li key={event.id} className="flex min-w-0 items-center gap-2 py-1.5 text-xs">
                {event.direction === 'inflow' ? <ArrowDownRight size={13} className="shrink-0 text-emerald-300" aria-hidden="true" /> : <ArrowUpRight size={13} className="shrink-0 text-amber-300" aria-hidden="true" />}
                <time className="shrink-0 text-[10px] text-obsidian-muted" dateTime={event.date}>{event.date}</time>
                <span className="min-w-0 flex-1 truncate text-obsidian-text" title={event.title}>{event.title}</span>
                {event.estimated && <span aria-label="Importe estimado" title="Importe estimado a partir de la recurrencia" className="shrink-0 text-[9px] text-amber-200">est.</span>}
                <span className={`shrink-0 font-mono tabular-nums ${event.direction === 'inflow' ? 'text-emerald-300' : 'text-obsidian-text'}`}>
                  {event.direction === 'inflow' ? '+' : '−'}${formatAmount(event.amountMXN, 0)} MXN
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-obsidian-muted">No hay movimientos futuros con fecha registrada.</p>
        )}
      </div>

      {(forecast.excludedCurrencyCount > 0 || forecast.undatedRecurringCount > 0) && (
        <p role="note" className="mt-2 flex items-start gap-1.5 text-[10px] text-amber-200">
          <Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            {forecast.excludedCurrencyCount > 0 && `${forecast.excludedCurrencyCount} movimiento(s) se omitieron porque falta cotización compatible.`}
            {forecast.excludedCurrencyCount > 0 && forecast.undatedRecurringCount > 0 ? ' ' : ''}
            {forecast.undatedRecurringCount > 0 && `${forecast.undatedRecurringCount} suscripción(es) no tienen próxima fecha de cobro.`}
          </span>
        </p>
      )}
    </section>
  );
};
