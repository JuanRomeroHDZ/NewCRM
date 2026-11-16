import React, { useMemo } from 'react';
import { AlertTriangle, ArrowRight, CalendarClock, Check, KeyRound, Mail, ShieldAlert } from 'lucide-react';
import type { ClientIncome, DomainRenewal, EmailAccount, PlatformAccount, SecurityAuditResponse } from '../../../types';

export type DashboardActionTarget = 'security' | 'finance' | 'subscriptions' | 'emails' | 'email' | 'platform';

interface ActionItem {
  id: string;
  title: string;
  detail: string;
  target: DashboardActionTarget;
  entityId?: string;
  urgency: number;
  days?: number;
}

type Props = {
  emails: EmailAccount[];
  platforms: PlatformAccount[];
  renewals: DomainRenewal[];
  incomes: ClientIncome[];
  securityAudit: SecurityAuditResponse | null;
  securityLoading: boolean;
  securityError: boolean;
  onOpen: (target: DashboardActionTarget, entityId?: string) => void;
};

function daysUntil(value?: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((date.getTime() - today) / 86_400_000);
}

function dayLabel(days: number): string {
  if (days < 0) return `vencido hace ${Math.abs(days)} d`;
  if (days === 0) return 'hoy';
  if (days === 1) return 'mañana';
  return `en ${days} días`;
}

export const DashboardActionCenter: React.FC<Props> = ({
  emails, platforms, renewals, incomes, securityAudit, securityLoading, securityError, onOpen,
}) => {
  const actions = useMemo(() => {
    const next: ActionItem[] = [];
    (securityAudit?.api_key_alerts || []).forEach((alert) => next.push({
      id: `api-key-${alert.id}`,
      title: `${alert.status === 'expired' ? 'API key vencida' : 'API key por vencer'} · ${alert.label}`,
      detail: `${alert.platform_name} · ${dayLabel(alert.days_remaining)}`,
      target: 'platform',
      entityId: alert.platform_id,
      urgency: alert.status === 'expired' ? 0 : 1,
      days: alert.days_remaining,
    }));

    const unprotected = securityAudit?.unprotected_emails || emails.filter((email) => email.two_factor_method === 'none');
    unprotected.slice(0, 2).forEach((email) => next.push({
      id: `mfa-${email.id}`,
      title: 'Activa la verificación en dos pasos',
      detail: `${email.address} · protege ${email.platform_count} servicios vinculados`,
      target: 'email',
      entityId: email.id,
      urgency: 1,
    }));
    const rootEmailsWithoutRecovery = emails.filter((email) => email.platform_count > 0 && !email.recovery_email_id && !email.recovery_phone);
    rootEmailsWithoutRecovery.slice(0, 2).forEach((email) => next.push({
      id: `recovery-${email.id}`,
      title: 'Configura recuperación para el correo principal',
      detail: `${email.address} · administra ${email.platform_count} servicios`,
      target: 'email',
      entityId: email.id,
      urgency: 2,
    }));
    if (unprotected.length > 2) next.push({
      id: 'more-unprotected-emails',
      title: 'Revisa otros correos sin verificación en dos pasos',
      detail: `${unprotected.length - 2} cuenta(s) adicionales sin MFA`,
      target: 'emails',
      urgency: 1,
    });

    const weakCount = securityAudit?.weak_passwords_count || 0;
    const reusedCount = securityAudit?.reused_passwords_count || 0;
    if (weakCount || reusedCount) next.push({
      id: 'password-health',
      title: 'Revisa contraseñas débiles o reutilizadas',
      detail: `${weakCount} débiles · ${reusedCount} reutilizadas`,
      target: 'security',
      urgency: 1,
    });

    const staleCount = securityAudit?.stale_passwords_count || 0;
    if (staleCount) next.push({
      id: 'stale-passwords',
      title: 'Actualiza contraseñas antiguas',
      detail: `${staleCount} cuentas superaron el plazo de rotación configurado`,
      target: 'security',
      urgency: 2,
    });

    platforms.forEach((platform) => {
      if (platform.subscription_status !== 'free_trial') return;
      const days = daysUntil(platform.trial_end_date || platform.next_billing_date);
      if (days === null || days > 30) return;
      next.push({
        id: `trial-${platform.id}`,
        title: `${days < 0 ? 'Revisar prueba vencida' : 'Termina la prueba'} · ${platform.name}`,
        detail: `${platform.trial_end_date || platform.next_billing_date} · ${dayLabel(days)}`,
        target: 'platform',
        entityId: platform.id,
        urgency: days <= 3 ? 0 : 1,
        days,
      });
    });

    renewals.filter((renewal) => renewal.status === 'activo' && renewal.days_remaining <= 30)
      .slice(0, 5)
      .forEach((renewal) => next.push({
        id: `renewal-${renewal.id}`,
        title: `${renewal.days_remaining < 0 ? 'Renovación vencida' : 'Renovación próxima'} · ${renewal.domain_or_service}`,
        detail: `${renewal.client_name} · ${dayLabel(renewal.days_remaining)}`,
        target: 'subscriptions',
        urgency: renewal.days_remaining <= 7 ? 0 : 1,
        days: renewal.days_remaining,
      }));

    const overdueIncome = incomes.filter((income) => income.status === 'pendiente' && (daysUntil(income.received_date) ?? 0) < 0);
    if (overdueIncome.length) next.push({
      id: 'overdue-income',
      title: 'Da seguimiento a cobros pendientes',
      detail: `${overdueIncome.length} ingreso(s) con fecha de cobro anterior a hoy`,
      target: 'finance',
      urgency: 1,
      days: -1,
    });
    const sorted = next.sort((a, b) => a.urgency - b.urgency || (a.days ?? 999) - (b.days ?? 999) || a.title.localeCompare(b.title));
    return { visible: sorted.slice(0, 6), total: sorted.length };
  }, [emails, platforms, renewals, incomes, securityAudit]);

  return (
    <section aria-labelledby="dashboard-actions-heading" className="min-w-0 rounded-xl border border-obsidian-border bg-obsidian-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldAlert size={16} className="shrink-0 text-emerald-300" aria-hidden="true" />
          <h2 id="dashboard-actions-heading" className="text-sm font-bold text-white">Acciones recomendadas</h2>
          <span className="text-xs tabular-nums text-obsidian-muted">{actions.total}</span>
        </div>
        <button type="button" onClick={() => onOpen('security')} className="inline-flex min-h-8 items-center gap-1 text-xs text-emerald-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
          Revisar seguridad <ArrowRight size={12} aria-hidden="true" />
        </button>
      </div>
      {securityLoading && <p role="status" className="mt-3 text-xs text-obsidian-muted">Actualizando señales de seguridad…</p>}
      {securityError && <p role="status" className="mt-3 text-xs text-amber-200">No se pudo actualizar el análisis de contraseñas; se muestran las alertas de cuentas y servicios disponibles.</p>}
      {actions.total > 0 ? (
        <ul className="mt-2 divide-y divide-obsidian-border">
          {actions.visible.map((action) => {
            const Icon = action.target === 'email' || action.target === 'emails' ? Mail : action.target === 'platform' ? KeyRound : action.target === 'subscriptions' || action.target === 'finance' ? CalendarClock : AlertTriangle;
            return (
              <li key={action.id}>
                <button type="button" onClick={() => onOpen(action.target, action.entityId)} className="group flex min-h-12 w-full min-w-0 items-center gap-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400">
                  <Icon size={15} className={action.urgency === 0 ? 'shrink-0 text-rose-300' : 'shrink-0 text-amber-300'} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-obsidian-text group-hover:text-white">{action.title}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-obsidian-muted">{action.detail}</span>
                  </span>
                  <ArrowRight size={13} className="shrink-0 text-obsidian-muted group-hover:text-emerald-300" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : !securityLoading && securityError ? (
        <p className="mt-3 flex items-start gap-2 text-xs text-amber-200"><AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />No hay alertas de cuenta disponibles; la auditoría de seguridad no respondió.</p>
      ) : !securityLoading ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-emerald-200"><Check size={14} aria-hidden="true" /> No hay acciones urgentes detectadas con los datos disponibles.</p>
      ) : null}
      {actions.total > actions.visible.length && <p className="mt-2 text-[10px] text-obsidian-muted">Mostrando las {actions.visible.length} prioridades más próximas; el resto se conserva en cada apartado.</p>}
    </section>
  );
};
