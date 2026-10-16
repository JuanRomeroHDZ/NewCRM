import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, Shield, AlertTriangle, CreditCard, 
  Mail, Globe, Key, Network, ArrowRight, DollarSign, 
  CheckCircle2, Clock, Sparkles, Briefcase, ExternalLink, MessageCircle
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { EmailAccount, PlatformAccount, PaymentMethod, Prospect } from '../../types';
import { PlatformIcon } from '../common/PlatformIcon';
import { TagBadge } from '../common/TagBadge';
import { computeLiveSla, getSlaBadgeMeta, getStatusMeta, buildWhatsAppUrl, formatDuration } from '../../lib/prospectUtils';

export const DashboardView: React.FC = () => {
  const { 
    setActiveSection, openInspector, openPlatformModal, openProspectModal,
    exchangeRate, dataVersion, showToast, triggerDataReload 
  } = useVault();

  const [emails, setEmails] = useState<EmailAccount[]>([]);
  const [platforms, setPlatforms] = useState<PlatformAccount[]>([]);
  const [payments, setPayments] = useState<PaymentMethod[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getEmails(),
      api.getPlatforms(),
      api.getPaymentMethods(),
      api.getProspects()
    ]).then(([emList, plList, payList, prList]) => {
      setEmails(emList);
      setPlatforms(plList);
      setPayments(payList);
      setProspects(prList);
    }).finally(() => setLoading(false));
  }, [dataVersion]);

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleMarkResponded = async (e: React.MouseEvent, prospect: Prospect) => {
    e.stopPropagation();
    try {
      const updated = await api.markProspectResponded(prospect.id);
      showToast(
        updated.sla_status === 'cumplido'
          ? `¡SLA Cumplido! "${updated.company_name}" respondió en ${formatDuration(updated.response_time_seconds ?? updated.elapsed_seconds)}.`
          : `Respuesta registrada para "${updated.company_name}".`,
        updated.sla_status === 'cumplido' ? 'success' : 'info'
      );
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message || 'Error al registrar respuesta', 'error');
    }
  };

  // Financial calculations
  const usdRate = exchangeRate?.rate || 18.50;

  // Monthly burn rate consolidated into MXN
  const totalMonthlyMXN = platforms.reduce((acc, p) => {
    if (p.subscription_status !== 'active') return acc;
    let cost = p.subscription_cost;
    // Normalize cycle to monthly
    if (p.billing_cycle === 'yearly') cost = cost / 12;
    else if (p.billing_cycle === 'weekly') cost = cost * 4.33;
    else if (p.billing_cycle === 'daily') cost = cost * 30;

    if (p.currency === 'USD') cost = cost * usdRate;
    return acc + cost;
  }, 0);

  const totalYearlyMXN = totalMonthlyMXN * 12;
  const totalMonthlyUSD = totalMonthlyMXN / usdRate;

  // Intelligence metrics
  const ssoCount = platforms.filter(p => p.access_type === 'sso').length;
  const ownPasswordCount = platforms.filter(p => p.access_type === 'own_password').length;
  const ssoPercentage = platforms.length > 0 ? Math.round((ssoCount / platforms.length) * 100) : 0;

  // Vulnerability alerts
  const emailsWithout2FA = emails.filter(e => e.two_factor_method === 'none');
  const expiringTrials = platforms.filter(p => p.subscription_status === 'free_trial');

  // Sorted upcoming billing platforms
  const upcomingBills = platforms
    .filter(p => p.next_billing_date && p.subscription_status === 'active')
    .sort((a, b) => (a.next_billing_date! > b.next_billing_date! ? 1 : -1))
    .slice(0, 5);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fadeIn">
      {/* Free Trials Alert Banner if present */}
      {expiringTrials.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start justify-between gap-4 shadow-lg shadow-amber-500/5">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 mt-0.5">
              <AlertTriangle size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                {expiringTrials.length} Prueba(s) Gratuita(s) con Renovación Automática Próxima
              </h3>
              <p className="text-xs text-amber-200/80 mt-0.5">
                Revisa las fechas límite para evitar cobros no deseados en tus tarjetas.
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {expiringTrials.map((tr) => (
                  <button
                    key={tr.id}
                    onClick={() => openInspector('platform', tr.id)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-obsidian-panel border border-amber-500/40 text-[11px] text-white hover:bg-obsidian-surface transition-colors"
                  >
                    <span>{tr.name}</span>
                    <span className="text-amber-400 font-mono">
                      (Termina: {tr.trial_end_date || tr.next_billing_date})
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button
            onClick={() => setActiveSection('subscriptions')}
            className="text-xs font-semibold text-amber-300 hover:text-white flex items-center gap-1 transition-colors whitespace-nowrap"
          >
            <span>Gestionar</span>
            <ArrowRight size={13} />
          </button>
        </div>
      )}

      {/* Top 4 Executive KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Monthly Spend */}
        <div className="p-5 rounded-2xl bg-obsidian-panel border border-obsidian-border hover:border-obsidian-borderLight transition-all">
          <div className="flex items-center justify-between text-obsidian-muted mb-2">
            <span className="text-xs font-medium">Gasto Mensual Estimado</span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <DollarSign size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-white tracking-tight">
            ${totalMonthlyMXN.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-sans text-obsidian-muted">MXN</span>
          </div>
          <div className="text-[11px] text-obsidian-muted mt-1 font-mono">
            ≈ ${totalMonthlyUSD.toFixed(2)} USD (Tasa: ${usdRate.toFixed(2)})
          </div>
        </div>

        {/* Total Annual Burn */}
        <div className="p-5 rounded-2xl bg-obsidian-panel border border-obsidian-border hover:border-obsidian-borderLight transition-all">
          <div className="flex items-center justify-between text-obsidian-muted mb-2">
            <span className="text-xs font-medium">Gasto Anual Consolidado</span>
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
              <CreditCard size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-white tracking-tight">
            ${totalYearlyMXN.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-sans text-obsidian-muted">MXN</span>
          </div>
          <div className="text-[11px] text-obsidian-muted mt-1">
            Total en {platforms.filter(p => p.subscription_status === 'active').length} suscripciones activas
          </div>
        </div>

        {/* SSO vs Own Password Ratio */}
        <div className="p-5 rounded-2xl bg-obsidian-panel border border-obsidian-border hover:border-obsidian-borderLight transition-all">
          <div className="flex items-center justify-between text-obsidian-muted mb-2">
            <span className="text-xs font-medium">Arquitectura de Acceso</span>
            <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
              <Key size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-white tracking-tight">
            {ssoPercentage}% <span className="text-xs font-sans text-obsidian-muted">SSO Federado</span>
          </div>
          <div className="text-[11px] text-obsidian-muted mt-1 flex items-center justify-between">
            <span>{ssoCount} SSO</span>
            <span>{ownPasswordCount} Claves Propias</span>
          </div>
        </div>

        {/* Security Health */}
        <div className="p-5 rounded-2xl bg-obsidian-panel border border-obsidian-border hover:border-obsidian-borderLight transition-all">
          <div className="flex items-center justify-between text-obsidian-muted mb-2">
            <span className="text-xs font-medium">Salud de Correos Raíz</span>
            <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400">
              <Shield size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-white tracking-tight">
            {emails.length - emailsWithout2FA.length} / {emails.length} <span className="text-xs font-sans text-obsidian-muted">con 2FA</span>
          </div>
          <div className="text-[11px] text-obsidian-muted mt-1">
            {emailsWithout2FA.length === 0 ? (
              <span className="text-emerald-400">✓ Todos los correos protegidos</span>
            ) : (
              <span className="text-amber-400">⚠ {emailsWithout2FA.length} correo(s) sin 2FA activo</span>
            )}
          </div>
        </div>
      </div>

      {/* CRM Prospectos & Demos SLA Summary Widget */}
      <div className="p-6 rounded-2xl bg-obsidian-panel border border-obsidian-border space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              <Briefcase size={16} className="text-indigo-400" />
              <span>Seguimiento de Prospectos & Páginas Demo (SLA de Respuesta)</span>
            </h2>
            <p className="text-xs text-obsidian-muted">
              Monitoreo en vivo de demos entregadas, tiempos límite de respuesta y correlación con correos raíz
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openProspectModal()}
              className="px-3 py-1.5 rounded-xl bg-obsidian-surface hover:bg-obsidian-card border border-obsidian-border text-xs text-white font-medium transition-colors"
            >
              + Nuevo Prospecto
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('prospects')}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 transition-colors px-2 py-1"
            >
              <span>Abrir CRM</span>
              <ArrowRight size={13} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
          {prospects.slice(0, 3).map((prospect) => {
            const live = computeLiveSla(prospect, nowMs);
            const slaMeta = getSlaBadgeMeta(live.slaStatus);
            const statusMeta = getStatusMeta(prospect.status);
            const waUrl = buildWhatsAppUrl(prospect.whatsapp, prospect.company_name);

            return (
              <div
                key={prospect.id}
                onClick={() => openInspector('prospect', prospect.id)}
                className="p-4 rounded-xl bg-obsidian-surface/60 hover:bg-obsidian-surface border border-obsidian-border hover:border-obsidian-borderLight transition-all cursor-pointer flex flex-col justify-between gap-3 group"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-white text-xs group-hover:text-indigo-300 transition-colors truncate">
                        {prospect.company_name}
                      </div>
                      <div className="text-[11px] text-obsidian-muted font-mono truncate">
                        {prospect.email_address || 'Sin correo vinculado'}
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border flex-shrink-0 ${slaMeta.badgeClass}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${slaMeta.dotClass}`} />
                      <span>{slaMeta.shortLabel}</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] bg-obsidian-panel/70 px-2.5 py-1.5 rounded-lg border border-obsidian-border/70">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${statusMeta.badgeClass}`}>
                      {statusMeta.label}
                    </span>
                    <span className="font-mono font-bold text-white">
                      {formatDuration(live.elapsedSeconds)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-obsidian-border/50" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1.5">
                    {prospect.demo_url && (
                      <a
                        href={prospect.demo_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/25 text-[10px] font-medium transition-colors"
                      >
                        <Globe size={11} />
                        <span>Demo</span>
                        <ExternalLink size={9} />
                      </a>
                    )}
                    {waUrl && (
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/25 text-[10px] font-medium transition-colors"
                      >
                        <MessageCircle size={11} />
                        <span>WhatsApp</span>
                      </a>
                    )}
                  </div>

                  {!prospect.responded_at ? (
                    <button
                      type="button"
                      onClick={(e) => handleMarkResponded(e, prospect)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold transition-colors"
                    >
                      <CheckCircle2 size={11} />
                      <span>Ya respondió</span>
                    </button>
                  ) : (
                    <span className="text-[10px] text-emerald-400 font-semibold">✓ Respondido</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Middle Section: Intelligence of Accounts & Upcoming Renewals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Most Utilized Root Emails (2 columns) */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-obsidian-panel border border-obsidian-border space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">
                Ranking de Correos Raíz Más Utilizados
              </h2>
              <p className="text-xs text-obsidian-muted">
                Jerarquía de dependencias: cuentas que sostienen la mayor cantidad de plataformas y prospectos
              </p>
            </div>
            <button
              onClick={() => setActiveSection('emails')}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 transition-colors"
            >
              <span>Ver todos</span>
              <ArrowRight size={13} />
            </button>
          </div>

          <div className="space-y-3 pt-2">
            {emails
              .sort((a, b) => (b.platform_count + (b.prospect_count || 0)) - (a.platform_count + (a.prospect_count || 0)))
              .map((email, idx) => (
                <div
                  key={email.id}
                  onClick={() => openInspector('email', email.id)}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-obsidian-surface/60 hover:bg-obsidian-surface border border-obsidian-border hover:border-obsidian-borderLight transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-lg bg-obsidian-card text-obsidian-muted font-mono text-xs flex items-center justify-center font-bold">
                      #{idx + 1}
                    </span>
                    <PlatformIcon name={email.provider} size="sm" />
                    <div>
                      <div className="font-semibold text-white text-xs group-hover:text-indigo-300 transition-colors">
                        {email.address}
                      </div>
                      <div className="text-[11px] text-obsidian-muted">
                        Proveedor: {email.provider} • 2FA: <span className="uppercase text-indigo-400">{email.two_factor_method}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="font-mono text-xs font-bold text-white">
                        {email.platform_count} plat. {(email.prospect_count ?? 0) > 0 ? `• ${email.prospect_count} prosp.` : ''}
                      </div>
                      <div className="text-[10px] text-obsidian-muted">
                        {email.recovery_email_address ? `Recupera a: ${email.recovery_email_address.split('@')[0]}` : 'Sin correo padre'}
                      </div>
                    </div>
                    <ArrowRight size={14} className="text-obsidian-muted group-hover:text-white transition-colors" />
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Upcoming Renewals Calendar Widget */}
        <div className="p-6 rounded-2xl bg-obsidian-panel border border-obsidian-border space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              <Clock size={16} className="text-indigo-400" />
              <span>Próximos Cobros</span>
            </h2>
            <button
              onClick={() => setActiveSection('subscriptions')}
              className="text-xs text-indigo-400 hover:text-indigo-300"
            >
              Ver calendario
            </button>
          </div>

          <div className="space-y-3">
            {upcomingBills.length > 0 ? (
              upcomingBills.map((b) => (
                <div
                  key={b.id}
                  onClick={() => openInspector('platform', b.id)}
                  className="p-3 rounded-xl bg-obsidian-surface/60 hover:bg-obsidian-surface border border-obsidian-border flex items-center justify-between cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <PlatformIcon name={b.name} iconUrl={b.icon_url} size="sm" />
                    <div>
                      <div className="font-semibold text-white text-xs">{b.name}</div>
                      <div className="text-[11px] text-obsidian-muted font-mono">{b.next_billing_date}</div>
                    </div>
                  </div>
                  <div className="font-mono text-xs font-bold text-emerald-400">
                    ${b.subscription_cost} {b.currency}
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-obsidian-muted">
                No hay cobros próximos registrados.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Visual Graph Banner */}
      <div 
        onClick={() => setActiveSection('graph')}
        className="p-6 rounded-2xl bg-gradient-to-r from-indigo-950/40 via-obsidian-panel to-obsidian-panel border border-indigo-500/20 hover:border-indigo-500/40 transition-all cursor-pointer group flex items-center justify-between shadow-xl"
      >
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-indigo-500/20 text-indigo-300 group-hover:scale-105 transition-transform">
            <Network size={26} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">
              Explorar Grafo de Identidades Estilo Obsidian
            </h3>
            <p className="text-xs text-obsidian-muted mt-0.5">
              Visualiza en lienzo dinámico las relaciones $A \rightarrow B$, dependencias de recuperación entre correos y detección de puntos únicos de fallo.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-all">
          <span>Abrir Grafo</span>
          <ArrowRight size={14} />
        </div>
      </div>
    </div>
  );
};
