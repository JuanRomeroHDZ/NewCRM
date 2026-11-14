import React from 'react';
import { ArrowRight, Clock, Mail } from 'lucide-react';
import type { EmailAccount, PlatformAccount } from '../../../types';
import type { RealProfitSummary } from '../../../lib/financeUtils';
import { PlatformIcon } from '../../common/PlatformIcon';

type DashboardAccountsSectionProps = {
  emails: EmailAccount[];
  renewals: RealProfitSummary['expiringSoonRenewals'];
  upcomingBills: PlatformAccount[];
  onOpenEmail: (emailId: string) => void;
  onOpenEmails: () => void;
  onCreateEmail: () => void;
  onOpenPlatform: (platformId: string) => void;
  onOpenSubscriptions: () => void;
};

export const DashboardAccountsSection: React.FC<DashboardAccountsSectionProps> = ({
  emails,
  renewals,
  upcomingBills,
  onOpenEmail,
  onOpenEmails,
  onCreateEmail,
  onOpenPlatform,
  onOpenSubscriptions,
}) => (
  <section className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-3" aria-label="Cuentas y vencimientos próximos">
    <div className="min-w-0 space-y-3 rounded-xl border border-obsidian-border bg-obsidian-panel p-4 sm:p-5 lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-sm font-bold tracking-tight text-white">Correos principales</h2>
          <span className="text-xs text-obsidian-muted">{emails.length}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={onOpenEmails} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-indigo-400 hover:text-indigo-300">
            Ver todas <ArrowRight size={12} aria-hidden="true" />
          </button>
          <button type="button" onClick={onCreateEmail} aria-label="Agregar correo principal" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-obsidian-muted hover:text-white">
            <Mail size={13} aria-hidden="true" /> Agregar
          </button>
        </div>
      </div>

      {emails.length > 0 ? (
        <div className="divide-y divide-obsidian-border/70">
          {emails
            .slice()
            .sort((a, b) => (b.platform_count + (b.prospect_count || 0)) - (a.platform_count + (a.prospect_count || 0)))
            .slice(0, 5)
            .map((email) => (
              <button key={email.id} type="button" onClick={() => onOpenEmail(email.id)} className="group flex w-full min-w-0 items-center justify-between gap-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
                <div className="flex min-w-0 items-center gap-3">
                  <PlatformIcon name={email.provider} size="sm" />
                  <div className="min-w-0">
                    <h3 className="truncate text-xs font-semibold text-white group-hover:text-indigo-300" title={email.address}>{email.address}</h3>
                    <p className="truncate text-[11px] text-obsidian-muted">
                      {email.provider} · Verificación: {email.two_factor_method === 'none' ? 'sin activar' : email.two_factor_method}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-right">
                  <div>
                    <p className="text-[11px] font-mono font-semibold text-white">
                      {email.platform_count} cuentas{(email.prospect_count ?? 0) > 0 ? ` · ${email.prospect_count} prospectos` : ''}
                    </p>
                    <p className="max-w-[150px] truncate text-[10px] text-obsidian-muted" title={email.recovery_email_address || 'Sin correo de respaldo'}>
                      {email.recovery_email_address ? `Respaldo: ${email.recovery_email_address}` : 'Sin correo de respaldo'}
                    </p>
                  </div>
                  <ArrowRight size={14} className="text-obsidian-muted group-hover:text-white" aria-hidden="true" />
                </div>
              </button>
            ))}
        </div>
      ) : (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-y border-obsidian-border py-4 text-xs text-obsidian-muted">
          <p>No hay correos principales registrados.</p>
        </div>
      )}
    </div>

    <div className="min-w-0 space-y-3 rounded-xl border border-obsidian-border bg-obsidian-panel p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-bold tracking-tight text-white">
          <Clock size={15} className="shrink-0 text-indigo-400" aria-hidden="true" />
          <span className="truncate">Próximos cobros</span>
        </h2>
        <button type="button" onClick={onOpenSubscriptions} className="inline-flex shrink-0 items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
          Ver todos <ArrowRight size={12} aria-hidden="true" />
        </button>
      </div>

      {renewals.length === 0 && upcomingBills.length === 0 ? (
        <p className="border-y border-obsidian-border py-4 text-xs text-obsidian-muted">No hay cobros ni vencimientos próximos.</p>
      ) : (
        <div className="divide-y divide-obsidian-border/70">
          {renewals.slice(0, 3).map((renewal) => (
            <button key={renewal.id} type="button" onClick={onOpenSubscriptions} className="flex w-full min-w-0 items-center justify-between gap-2 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-white" title={renewal.domain_or_service}>{renewal.domain_or_service}</span>
                <span className="block truncate text-[10px] text-amber-300">{renewal.client_name} · {renewal.days_remaining <= 0 ? 'Vencido' : `En ${renewal.days_remaining} días`}</span>
              </span>
              <span className="shrink-0 text-xs font-mono font-semibold text-amber-300">${renewal.renewal_cost} {renewal.currency}</span>
            </button>
          ))}
          {upcomingBills.slice(0, 5).map((bill) => (
            <button key={bill.id} type="button" onClick={() => onOpenPlatform(bill.id)} className="flex w-full min-w-0 items-center justify-between gap-2 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
              <span className="flex min-w-0 items-center gap-2">
                <PlatformIcon name={bill.name} iconUrl={bill.icon_url} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-white" title={bill.name}>{bill.name}</span>
                  <span className="block truncate text-[10px] font-mono text-obsidian-muted">{bill.next_billing_date}</span>
                </span>
              </span>
              <span className="shrink-0 text-xs font-mono font-semibold text-emerald-400">${bill.subscription_cost} {bill.currency}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  </section>
);
