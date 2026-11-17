import React from 'react';
import { AlertTriangle } from 'lucide-react';

type DashboardMetricsProps = {
  monthlyMXN: number;
  monthlyUSD: number;
  weeklyMXN: number;
  netMonthMXN: number;
  monthIncomeMXN: number;
  netYearMXN: number;
  ssoPercentage: number;
  ssoCount: number;
  ownPasswordCount: number;
  protectedEmailsCount: number;
  emailCount: number;
  emailsWithout2FA: number;
  formatAmount: (value: number | string | null | undefined, decimals?: number) => string;
};

const metricCardClass = 'min-w-0 border-b border-obsidian-border pb-3 last:border-b-0 last:pb-0 min-[420px]:border-b-0 min-[420px]:pb-0';

export const DashboardMetrics: React.FC<DashboardMetricsProps> = ({
  monthlyMXN,
  monthlyUSD,
  weeklyMXN,
  netMonthMXN,
  monthIncomeMXN,
  netYearMXN,
  ssoPercentage,
  ssoCount,
  ownPasswordCount,
  protectedEmailsCount,
  emailCount,
  emailsWithout2FA,
  formatAmount,
}) => (
  <section aria-label="Indicadores principales" className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-3 rounded-xl border border-obsidian-border bg-obsidian-panel p-4 min-[420px]:grid-cols-2 sm:p-6 min-[760px]:grid-cols-4">
    <div className={metricCardClass}>
      <div className="mb-2 flex items-center justify-between gap-2 text-obsidian-muted">
        <span className="text-xs font-medium">Gasto mensual</span>
      </div>
      <div className="break-words font-mono text-lg font-bold tracking-tight tabular-nums text-white sm:text-xl">
        ${formatAmount(monthlyMXN)} <span className="text-xs font-sans text-obsidian-muted">MXN</span>
      </div>
      <div className="mt-1 break-words text-xs text-obsidian-muted">
        Suscripciones · ${formatAmount(monthlyUSD)} USD · Semanal: ${formatAmount(weeklyMXN)} MXN
      </div>
    </div>

    <div className={metricCardClass}>
      <div className="mb-2 flex items-center justify-between gap-2 text-obsidian-muted">
        <span className="text-xs font-medium">Ganancia del mes</span>
      </div>
      <div className={`break-words font-mono text-lg font-bold tracking-tight tabular-nums sm:text-xl ${netMonthMXN > 0 ? 'text-emerald-400' : netMonthMXN < 0 ? 'text-rose-400' : 'text-obsidian-muted'}`}>
        {netMonthMXN > 0 ? '+' : netMonthMXN < 0 ? '-' : ''}${formatAmount(Math.abs(netMonthMXN))}{' '}
        <span className="text-xs font-sans text-obsidian-muted">MXN</span>
      </div>
      <div className="mt-1 break-words text-xs text-obsidian-muted">
        Cobrado: ${formatAmount(monthIncomeMXN)} MXN · Año: {netYearMXN > 0 ? '+' : netYearMXN < 0 ? '-' : ''}${formatAmount(Math.abs(netYearMXN), 0)} MXN
      </div>
    </div>

    <div className={metricCardClass}>
      <div className="mb-2 flex items-center justify-between gap-2 text-obsidian-muted">
        <span className="text-xs font-medium">Acceso con correo</span>
      </div>
      <div className="break-words font-mono text-lg font-bold tracking-tight tabular-nums text-white sm:text-xl">
        {ssoPercentage}% <span className="text-xs font-sans text-obsidian-muted">del total</span>
      </div>
      <div className="mt-1 flex flex-wrap justify-between gap-x-2 gap-y-1 text-xs text-obsidian-muted">
        <span>{ssoCount} con correo</span>
        <span>{ownPasswordCount} con clave propia</span>
      </div>
    </div>

    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2 text-obsidian-muted">
        <span className="text-xs font-medium">Correos protegidos</span>
      </div>
      <div className="break-words font-mono text-lg font-bold tracking-tight tabular-nums text-white sm:text-xl">
        {protectedEmailsCount} / {emailCount} <span className="text-xs font-sans text-obsidian-muted">con 2 pasos</span>
      </div>
      <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-obsidian-muted">
        {emailCount === 0 ? (
          <span className="truncate">Sin correos principales</span>
        ) : emailsWithout2FA === 0 ? (
          null
        ) : (
          <span className="inline-flex min-w-0 items-center gap-1 text-amber-400">
            <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{emailsWithout2FA} sin verificación en 2 pasos</span>
          </span>
        )}
      </div>
    </div>
  </section>
);
