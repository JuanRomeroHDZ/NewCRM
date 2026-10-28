import React, { useState, useEffect, useMemo } from 'react';
import { 
  Shield, AlertTriangle, CreditCard, 
  Mail, Key, Network, ArrowRight, DollarSign, 
  CheckCircle2, Clock, Briefcase, ExternalLink, MessageCircle, Globe, Plus,
  BarChart3, TrendingUp, PiggyBank, BellRing, Copy, Target, Wallet, Server
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { 
  EmailAccount, PlatformAccount, PaymentMethod, Prospect, VaultStatus,
  ClientIncome, DomainRenewal, OneTimeExpense
} from '../../types';
import { PlatformIcon } from '../common/PlatformIcon';
import { InfoTooltip } from '../common/InfoTooltip';
import { 
  computeLiveSla, getSlaBadgeMeta, getStatusMeta, buildWhatsAppUrl, 
  formatDuration, isProspectNeedingRecontact, buildFollowUpMessage, 
  buildMailtoUrl, formatRelativeContactTime, computeCommercialPipelineSummary 
} from '../../lib/prospectUtils';
import { 
  computeFinancialExecutiveSummary, evaluateBudgetCap, formatMoney,
  computeRealProfitAndRenewalsSummary
} from '../../lib/financeUtils';

export const DashboardView: React.FC = () => {
  const { 
    setActiveSection, openInspector, openEmailModal, openProspectModal,
    isUnlocked, openUnlockModal, exchangeRate, dataVersion, showToast, triggerDataReload,
    activeScope, matchesScope 
  } = useVault();

  const [emails, setEmails] = useState<EmailAccount[]>([]);
  const [platforms, setPlatforms] = useState<PlatformAccount[]>([]);
  const [payments, setPayments] = useState<PaymentMethod[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [incomes, setIncomes] = useState<ClientIncome[]>([]);
  const [renewals, setRenewals] = useState<DomainRenewal[]>([]);
  const [expenses, setExpenses] = useState<OneTimeExpense[]>([]);
  const [vaultSettings, setVaultSettings] = useState<VaultStatus | null>(null);
  const [pipelineCurrency, setPipelineCurrency] = useState<'MXN' | 'USD'>('MXN');
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getEmails(),
      api.getPlatforms(),
      api.getPaymentMethods(),
      api.getProspects(),
      api.getIncomes().catch(() => [] as ClientIncome[]),
      api.getRenewals().catch(() => [] as DomainRenewal[]),
      api.getExpenses().catch(() => [] as OneTimeExpense[]),
      api.getVaultStatus().catch(() => null)
    ]).then(([emList, plList, payList, prList, incList, renList, expList, vStatus]) => {
      setEmails(emList);
      setPlatforms(plList);
      setPayments(payList);
      setProspects(prList);
      setIncomes(incList);
      setRenewals(renList);
      setExpenses(expList);
      if (vStatus) setVaultSettings(vStatus);
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
          ? `Respondido a tiempo: "${updated.company_name}" respondió en ${formatDuration(updated.response_time_seconds ?? updated.elapsed_seconds)}.`
          : `Respuesta registrada para "${updated.company_name}".`,
        updated.sla_status === 'cumplido' ? 'success' : 'info'
      );
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message || 'Error al registrar respuesta', 'error');
    }
  };

  const handleQuickContact = async (
    e: React.MouseEvent,
    prospect: Prospect,
    channel: 'whatsapp' | 'email' | 'template_copy'
  ) => {
    e.stopPropagation();
    try {
      const followUpMsg = buildFollowUpMessage(prospect);
      if (channel === 'whatsapp') {
        const waUrl = buildWhatsAppUrl(prospect.whatsapp, prospect.company_name, prospect.demo_url, followUpMsg);
        if (!waUrl) {
          showToast('Este prospecto no tiene número de WhatsApp configurado.', 'error');
          return;
        }
        window.open(waUrl, '_blank', 'noopener,noreferrer');
      } else if (channel === 'email') {
        const mailUrl = buildMailtoUrl(prospect);
        if (!mailUrl) {
          showToast('Este prospecto no tiene correo electrónico vinculado.', 'error');
          return;
        }
        window.location.href = mailUrl;
      } else {
        await navigator.clipboard.writeText(followUpMsg);
      }

      const apiChannel = channel === 'template_copy' ? 'template' : channel;
      const updated = await api.recordProspectContactAttempt(prospect.id, apiChannel, prospect.followup_sla_hours || 48);
      setProspects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      showToast(
        channel === 'template_copy'
          ? `Mensaje copiado y seguimiento #${updated.followup_count || 1} registrado.`
          : `Seguimiento #${updated.followup_count || 1} registrado para "${prospect.company_name}".`,
        'success'
      );
    } catch (err: any) {
      showToast(err.message || 'Error al registrar seguimiento', 'error');
    }
  };

  // Filtered lists for the active scope
  const filteredEmails = useMemo(() => emails.filter((e) => matchesScope(e.scope)), [emails, matchesScope]);
  const filteredPlatforms = useMemo(() => platforms.filter((p) => matchesScope(p.scope)), [platforms, matchesScope]);
  const filteredProspects = useMemo(() => prospects.filter((p) => matchesScope(p.scope)), [prospects, matchesScope]);

  // Financial Executive Analytics
  const fin = useMemo(
    () => computeFinancialExecutiveSummary(platforms, payments, exchangeRate?.rate, activeScope, expenses),
    [platforms, payments, exchangeRate?.rate, activeScope, expenses]
  );

  const realProfit = useMemo(
    () => computeRealProfitAndRenewalsSummary(incomes, renewals, fin, exchangeRate?.rate, expenses, activeScope),
    [incomes, renewals, fin, exchangeRate?.rate, expenses, activeScope]
  );

  const budgetCapEval = useMemo(
    () =>
      evaluateBudgetCap(
        fin.monthlyMXN,
        fin.peakMonth.totalMXN,
        vaultSettings?.budget_cap_amount || 0,
        vaultSettings?.budget_cap_currency || 'MXN',
        fin.usdRate
      ),
    [fin, vaultSettings]
  );

  const pipelineSummary = useMemo(
    () => computeCommercialPipelineSummary(filteredProspects, fin.usdRate, fin.monthlyMXN),
    [filteredProspects, fin.usdRate, fin.monthlyMXN]
  );

  // Intelligence metrics
  const ssoCount = filteredPlatforms.filter((p) => p.access_type === 'sso').length;
  const ownPasswordCount = filteredPlatforms.filter((p) => p.access_type === 'own_password').length;
  const ssoPercentage = filteredPlatforms.length > 0 ? Math.round((ssoCount / filteredPlatforms.length) * 100) : 0;

  // Vulnerability alerts
  const emailsWithout2FA = filteredEmails.filter((e) => e.two_factor_method === 'none');
  const expiringTrials = filteredPlatforms.filter((p) => p.subscription_status === 'free_trial');

  // Prospects needing re-contact
  const recontactProspects = useMemo(
    () => filteredProspects.filter((p) => p.status !== 'archivado_frio' && isProspectNeedingRecontact(p, nowMs)),
    [filteredProspects, nowMs]
  );

  // Sorted upcoming billing platforms
  const upcomingBills = filteredPlatforms
    .filter((p) => p.next_billing_date && p.subscription_status === 'active')
    .sort((a, b) => (a.next_billing_date! > b.next_billing_date! ? 1 : -1))
    .slice(0, 5);

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-7 animate-fadeIn">
      {/* Free Trials Alert Banner if present */}
      {expiringTrials.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-start justify-between gap-4 shadow-lg shadow-amber-500/5">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 mt-0.5 flex-shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white">
                {expiringTrials.length} Prueba(s) Gratis por Cobrarse Pronto
              </h3>
              <div className="flex flex-wrap gap-2 mt-2">
                {expiringTrials.map((tr) => (
                  <button
                    key={tr.id}
                    onClick={() => openInspector('platform', tr.id)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-obsidian-panel border border-amber-500/40 text-[11px] text-white hover:bg-obsidian-surface transition-colors max-w-full min-w-0"
                  >
                    <span className="truncate max-w-[160px]">{tr.name}</span>
                    <span className="text-amber-400 font-mono flex-shrink-0">
                      ({tr.trial_end_date || tr.next_billing_date})
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button
            onClick={() => setActiveSection('subscriptions')}
            className="text-xs font-semibold text-amber-300 hover:text-white flex items-center gap-1 transition-colors whitespace-nowrap flex-shrink-0"
          >
            <span>Revisar</span>
            <ArrowRight size={13} />
          </button>
        </div>
      )}

      {/* Top 4 Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Monthly Spend */}
        <div className="p-5 rounded-2xl bg-obsidian-panel border border-obsidian-border hover:border-obsidian-borderLight transition-all min-w-0">
          <div className="flex items-center justify-between text-obsidian-muted mb-2 gap-2">
            <span className="text-xs font-medium truncate">Gasto Mensual en Suscripciones</span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 flex-shrink-0">
              <DollarSign size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-white tracking-tight truncate" title={`$${formatMoney(fin.monthlyMXN)} MXN`}>
            ${formatMoney(fin.monthlyMXN)} <span className="text-xs font-sans text-obsidian-muted">MXN</span>
          </div>
          <div className="text-[11px] text-obsidian-muted mt-1 font-mono truncate">
            ${formatMoney(fin.monthlyUSD)} USD • Semanal: ${formatMoney(fin.weeklyMXN)} MXN
          </div>
        </div>

        {/* Ganancia Neta Real del Mes */}
        <div className="p-5 rounded-2xl bg-obsidian-panel border border-obsidian-border hover:border-obsidian-borderLight transition-all min-w-0">
          <div className="flex items-center justify-between text-obsidian-muted mb-2 gap-2">
            <span className="text-xs font-medium truncate">Ganancia Neta Real (Mes)</span>
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 flex-shrink-0">
              <Wallet size={16} />
            </div>
          </div>
          <div
            className={`text-2xl font-bold font-mono tracking-tight truncate ${
              realProfit.netMonthMXN >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
            title={`$${formatMoney(realProfit.netMonthMXN)} MXN`}
          >
            {realProfit.netMonthMXN >= 0 ? '+' : '-'}${formatMoney(Math.abs(realProfit.netMonthMXN))}{' '}
            <span className="text-xs font-sans text-obsidian-muted">MXN</span>
          </div>
          <div className="text-[11px] text-obsidian-muted mt-1 font-mono truncate">
            Cobrado: ${formatMoney(realProfit.monthIncomeMXN)} MXN • Año: {realProfit.netYearMXN >= 0 ? '+' : '-'}${formatMoney(Math.abs(realProfit.netYearMXN), 0)}
          </div>
        </div>

        {/* SSO vs Own Password Ratio */}
        <div className="p-5 rounded-2xl bg-obsidian-panel border border-obsidian-border hover:border-obsidian-borderLight transition-all min-w-0">
          <div className="flex items-center justify-between text-obsidian-muted mb-2 gap-2">
            <span className="text-xs font-medium truncate">Forma de Inicio de Sesión</span>
            <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 flex-shrink-0">
              <Key size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-white tracking-tight truncate">
            {ssoPercentage}% <span className="text-xs font-sans text-obsidian-muted">Con tu correo</span>
          </div>
          <div className="text-[11px] text-obsidian-muted mt-1 flex items-center justify-between gap-2">
            <span className="truncate">{ssoCount} con correo</span>
            <span className="truncate">{ownPasswordCount} con clave propia</span>
          </div>
        </div>

        {/* Security Health */}
        <div className="p-5 rounded-2xl bg-obsidian-panel border border-obsidian-border hover:border-obsidian-borderLight transition-all min-w-0">
          <div className="flex items-center justify-between text-obsidian-muted mb-2 gap-2">
            <span className="text-xs font-medium truncate">Protección de Correos Principales</span>
            <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 flex-shrink-0">
              <Shield size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-white tracking-tight truncate">
            {emails.length - emailsWithout2FA.length} / {emails.length} <span className="text-xs font-sans text-obsidian-muted">con 2 pasos</span>
          </div>
          <div className="text-[11px] text-obsidian-muted mt-1 flex items-center gap-1.5 min-w-0">
            {emails.length === 0 ? (
              <span className="truncate">Sin correos principales registrados</span>
            ) : emailsWithout2FA.length === 0 ? (
              <span className="text-emerald-400 inline-flex items-center gap-1 truncate">
                <CheckCircle2 size={12} className="flex-shrink-0" />
                <span className="truncate">Todos tus correos están protegidos</span>
              </span>
            ) : (
              <span className="text-amber-400 inline-flex items-center gap-1 truncate">
                <AlertTriangle size={12} className="flex-shrink-0" />
                <span className="truncate">{emailsWithout2FA.length} correo(s) sin verificación en 2 pasos</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* High-Level Financial Executive Summary Widget + Ganancia Neta Real + Vencimientos */}
      <div className="p-5 sm:p-6 rounded-2xl bg-obsidian-panel border border-obsidian-border space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <BarChart3 size={16} className="text-emerald-400 flex-shrink-0" />
            <h2 className="text-sm font-bold text-white tracking-tight truncate">
              Resumen de Finanzas, Ganancia Neta y Dominios
            </h2>
            <InfoTooltip content="Compara tus ingresos cobrados contra tus gastos de suscripciones por semana, mes y año, además de alertarte sobre dominios o hostings próximos a vencer." />
          </div>
          <button
            type="button"
            onClick={() => setActiveSection('subscriptions')}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 transition-colors flex-shrink-0"
          >
            <span>Ir a Finanzas e Ingresos</span>
            <ArrowRight size={13} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Ganancia Neta Real (Semana / Mes / Año) */}
          <div className="p-3.5 rounded-xl bg-obsidian-surface/60 border border-emerald-500/25 min-w-0">
            <div className="text-[10px] font-semibold text-emerald-300 uppercase flex items-center gap-1">
              <Wallet size={11} className="text-emerald-400 shrink-0" />
              <span className="truncate">Ganancia Neta Real</span>
            </div>
            <div className="mt-1.5 space-y-1 text-xs font-mono">
              <div className="flex justify-between gap-2">
                <span className="text-obsidian-muted">Semana:</span>
                <span className={`font-semibold truncate ${realProfit.netWeekMXN >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {realProfit.netWeekMXN >= 0 ? '+' : '-'}${formatMoney(Math.abs(realProfit.netWeekMXN))} MXN
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-obsidian-muted">Mes:</span>
                <span className={`font-bold truncate ${realProfit.netMonthMXN >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {realProfit.netMonthMXN >= 0 ? '+' : '-'}${formatMoney(Math.abs(realProfit.netMonthMXN))} MXN
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-obsidian-muted">Año:</span>
                <span className={`font-semibold truncate ${realProfit.netYearMXN >= 0 ? 'text-indigo-300' : 'text-rose-400'}`}>
                  {realProfit.netYearMXN >= 0 ? '+' : '-'}${formatMoney(Math.abs(realProfit.netYearMXN))} MXN
                </span>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-obsidian-surface/60 border border-obsidian-border min-w-0">
            <div className="text-[10px] font-semibold text-obsidian-muted uppercase">Gastos en Suscripciones</div>
            <div className="mt-1.5 space-y-1 text-xs font-mono">
              <div className="flex justify-between gap-2">
                <span className="text-obsidian-muted">Semanal:</span>
                <span className="text-white font-semibold truncate">${formatMoney(fin.weeklyMXN)} MXN</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-obsidian-muted">Mensual:</span>
                <span className="text-emerald-400 font-bold truncate">${formatMoney(fin.monthlyMXN)} MXN</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-obsidian-muted">Anual:</span>
                <span className="text-indigo-300 font-semibold truncate">${formatMoney(fin.yearlyMXN)} MXN</span>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-obsidian-surface/60 border border-obsidian-border min-w-0">
            <div className="text-[10px] font-semibold text-obsidian-muted uppercase flex items-center gap-1">
              <TrendingUp size={11} className="text-rose-400 shrink-0" />
              <span className="truncate">Mes con Más y Menos Gasto</span>
            </div>
            <div className="mt-1.5 space-y-1 text-xs font-mono">
              <div className="flex justify-between gap-2">
                <span className="text-rose-300">Más alto ({fin.peakMonth.shortName}):</span>
                <span className="text-white font-bold truncate">${formatMoney(fin.peakMonth.totalMXN)} MXN</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-emerald-300">Más bajo ({fin.lowestMonth.shortName}):</span>
                <span className="text-white font-semibold truncate">${formatMoney(fin.lowestMonth.totalMXN)} MXN</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-amber-300">Semana pesada:</span>
                <span className="text-white truncate">{fin.peakWeek.label} (${formatMoney(fin.peakWeek.totalMXN, 0)})</span>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-obsidian-surface/60 border border-obsidian-border min-w-0">
            <div className="text-[10px] font-semibold text-obsidian-muted uppercase flex items-center gap-1">
              <Server size={11} className="text-cyan-400 shrink-0" />
              <span className="truncate">Dominios y Hosting ({realProfit.activeRenewalsCount})</span>
            </div>
            <div className="mt-1.5 space-y-1 text-xs font-mono">
              <div className="flex justify-between gap-2">
                <span className="text-obsidian-muted">Por vencer (30d):</span>
                <span className={realProfit.expiringSoonRenewals.length > 0 ? 'text-amber-300 font-bold' : 'text-emerald-400'}>
                  {realProfit.expiringSoonRenewals.length} servicio(s)
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-obsidian-muted">Pago yo:</span>
                <span className="text-rose-300 truncate">${formatMoney(realProfit.myRenewalsYearlyMXN, 0)} MXN/año</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-obsidian-muted">Paga cliente:</span>
                <span className="text-emerald-300 truncate">${formatMoney(realProfit.clientRenewalsYearlyMXN, 0)} MXN/año</span>
              </div>
            </div>
          </div>
        </div>

        {/* Comparative Row: Cotizaciones vs. Gasto Operativo + Límite de Gasto Mensual */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-2 border-t border-obsidian-border/60">
          {/* Cotizaciones vs Gasto Operativo */}
          <div className="p-3.5 rounded-xl bg-obsidian-surface/60 border border-obsidian-border flex flex-wrap items-center justify-between gap-3 min-w-0">
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <Briefcase size={13} className="text-emerald-400 shrink-0" />
                <span className="text-xs font-bold text-white truncate">
                  Cotizaciones de Prospectos vs. Gasto Mensual
                </span>
                <InfoTooltip content="Compara el valor de tus cotizaciones activas y proyectos cerrados frente a lo que gastas al mes en herramientas." />
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                <span>
                  En negociación: <strong className="text-indigo-300">${formatMoney(pipelineCurrency === 'MXN' ? pipelineSummary.activePipelineMXN : pipelineSummary.activePipelineUSD)} {pipelineCurrency}</strong>
                </span>
                <span>•</span>
                <span>
                  Respondidos: <strong className="text-emerald-400">${formatMoney(pipelineCurrency === 'MXN' ? pipelineSummary.closedWonMXN : pipelineSummary.closedWonUSD)} {pipelineCurrency}</strong>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono text-xs font-bold">
                {pipelineSummary.monthlyCostCoverageRatio.toFixed(1)} meses cubiertos
              </span>
              <div className="flex items-center p-0.5 rounded-lg bg-obsidian-bg border border-obsidian-border text-[10px] font-mono">
                {(['MXN', 'USD'] as const).map((curr) => (
                  <button
                    key={curr}
                    type="button"
                    onClick={() => setPipelineCurrency(curr)}
                    className={`px-1.5 py-0.5 rounded ${
                      pipelineCurrency === curr ? 'bg-indigo-600 text-white font-semibold' : 'text-obsidian-muted hover:text-white'
                    }`}
                  >
                    {curr}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Límite de Gasto Mensual Status */}
          <div className="p-3.5 rounded-xl bg-obsidian-surface/60 border border-obsidian-border flex flex-col justify-center space-y-1.5 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
                <Target size={13} className="text-indigo-400 shrink-0" />
                <span className="truncate">Límite de Gasto Mensual</span>
              </span>
              {budgetCapEval.enabled ? (
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold border shrink-0 ${
                    budgetCapEval.level === 'critical'
                      ? 'bg-rose-500/15 text-rose-300 border-rose-500/35'
                      : budgetCapEval.level === 'warning'
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                      : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                  }`}
                >
                  {budgetCapEval.usagePercent.toFixed(0)}% del Límite (${formatMoney(budgetCapEval.capMXN, 0)} MXN)
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveSection('subscriptions')}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium"
                >
                  Definir Límite
                </button>
              )}
            </div>
            {budgetCapEval.enabled && (
              <div className="w-full h-1.5 rounded-full bg-obsidian-bg overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    budgetCapEval.level === 'critical'
                      ? 'bg-rose-500'
                      : budgetCapEval.level === 'warning'
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, budgetCapEval.usagePercent)}%` }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CRM Prospectos & Demos Summary Widget */}
      <div className="p-6 rounded-2xl bg-obsidian-panel border border-obsidian-border space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Briefcase size={16} className="text-indigo-400 flex-shrink-0" />
            <h2 className="text-sm font-bold text-white tracking-tight truncate">
              Seguimiento de Prospectos y Páginas Demo
            </h2>
            {recontactProspects.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveSection('prospects')}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[11px] font-semibold hover:bg-amber-500/25 transition-colors"
              >
                <BellRing size={11} />
                <span>{recontactProspects.length} Para Volver a Contactar</span>
              </button>
            )}
            <InfoTooltip content="Revisa qué clientes potenciales siguen dentro del tiempo límite de respuesta y envíales seguimiento por WhatsApp o correo con un clic." />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => openProspectModal()}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-obsidian-surface hover:bg-obsidian-card border border-obsidian-border text-xs text-white font-medium transition-colors"
            >
              <Plus size={13} />
              <span>Nuevo Prospecto</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('prospects')}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 transition-colors px-2 py-1"
            >
              <span>Ver Todos</span>
              <ArrowRight size={13} />
            </button>
          </div>
        </div>

        {filteredProspects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
            {filteredProspects.slice(0, 3).map((prospect) => {
              const live = computeLiveSla(prospect, nowMs);
              const slaMeta = getSlaBadgeMeta(live.slaStatus);
              const statusMeta = getStatusMeta(prospect.status);
              const needsRecontact = isProspectNeedingRecontact(prospect, nowMs);

              return (
                <div
                  key={prospect.id}
                  onClick={() => openInspector('prospect', prospect.id)}
                  className={`p-4 rounded-xl bg-obsidian-surface/60 hover:bg-obsidian-surface border transition-all cursor-pointer flex flex-col justify-between gap-3 group min-w-0 ${
                    needsRecontact
                      ? 'border-amber-500/30 hover:border-amber-500/50'
                      : 'border-obsidian-border hover:border-obsidian-borderLight'
                  }`}
                >
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-white text-xs group-hover:text-indigo-300 transition-colors truncate" title={prospect.company_name}>
                          {prospect.company_name}
                        </div>
                        <div className="text-[11px] text-obsidian-muted font-mono truncate" title={prospect.email_address || 'Sin correo vinculado'}>
                          {prospect.email_address || 'Sin correo vinculado'}
                        </div>
                      </div>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border flex-shrink-0 ${slaMeta.badgeClass}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${slaMeta.dotClass}`} />
                        <span>{slaMeta.shortLabel}</span>
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] bg-obsidian-panel/70 px-2.5 py-1.5 rounded-lg border border-obsidian-border/70 gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border truncate ${statusMeta.badgeClass}`}>
                        {statusMeta.label}
                      </span>
                      <span className="font-mono font-bold text-white flex-shrink-0">
                        {formatDuration(live.elapsedSeconds)}
                      </span>
                    </div>

                    {prospect.last_contacted_at && (
                      <div className="text-[10px] font-mono text-obsidian-muted truncate">
                        Último contacto: {formatRelativeContactTime(prospect.last_contacted_at)} ({prospect.followup_count || 1}x)
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-obsidian-border/50" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      {prospect.demo_url && (
                        <a
                          href={prospect.demo_url}
                          target="_blank"
                          rel="noreferrer"
                          title="Abrir página demo"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/25 text-[10px] font-medium transition-colors"
                        >
                          <Globe size={11} />
                          <span>Demo</span>
                          <ExternalLink size={9} />
                        </a>
                      )}
                      {prospect.whatsapp && (
                        <button
                          type="button"
                          onClick={(e) => handleQuickContact(e, prospect, 'whatsapp')}
                          title="Enviar seguimiento por WhatsApp"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/25 text-[10px] font-medium transition-colors"
                        >
                          <MessageCircle size={11} />
                          <span>WA</span>
                        </button>
                      )}
                      {prospect.email_address && (
                        <button
                          type="button"
                          onClick={(e) => handleQuickContact(e, prospect, 'email')}
                          title="Enviar correo"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/25 text-[10px] font-medium transition-colors"
                        >
                          <Mail size={11} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleQuickContact(e, prospect, 'template_copy')}
                        title="Copiar mensaje de seguimiento"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-obsidian-panel hover:bg-obsidian-card text-obsidian-muted hover:text-white border border-obsidian-border text-[10px] font-medium transition-colors"
                      >
                        <Copy size={11} />
                      </button>
                    </div>

                    {!prospect.responded_at ? (
                      <button
                        type="button"
                        onClick={(e) => handleMarkResponded(e, prospect)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold transition-colors"
                      >
                        <CheckCircle2 size={11} />
                        <span>Respondió</span>
                      </button>
                    ) : (
                      <span className="text-[10px] text-emerald-400 font-semibold inline-flex items-center gap-1">
                        <CheckCircle2 size={11} />
                        <span>Respondido</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-6 px-4 rounded-xl bg-obsidian-surface/40 border border-obsidian-border text-center text-xs text-obsidian-muted space-y-2">
            <p>No hay prospectos ni páginas demo registradas actualmente.</p>
            <button
              type="button"
              onClick={() => openProspectModal()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
            >
              <Plus size={13} />
              <span>Registrar Primer Prospecto</span>
            </button>
          </div>
        )}
      </div>

      {/* Middle Section: Correos Principales & Próximos Cobros / Dominios */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Most Utilized Principal Emails (2 columns) */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-obsidian-panel border border-obsidian-border space-y-4 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-sm font-bold text-white tracking-tight truncate">
                Correos Principales
              </h2>
              <InfoTooltip content="Tus cuentas de correo principales ordenadas según la cantidad de servicios y clientes que dependen de ellas." />
            </div>
            <button
              onClick={() => setActiveSection('emails')}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 transition-colors flex-shrink-0"
            >
              <span>Ver todos</span>
              <ArrowRight size={13} />
            </button>
          </div>

          {filteredEmails.length > 0 ? (
            <div className="space-y-3 pt-1">
              {filteredEmails
                .slice()
                .sort((a, b) => (b.platform_count + (b.prospect_count || 0)) - (a.platform_count + (a.prospect_count || 0)))
                .map((email, idx) => (
                  <div
                    key={email.id}
                    onClick={() => openInspector('email', email.id)}
                    className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-obsidian-surface/60 hover:bg-obsidian-surface border border-obsidian-border hover:border-obsidian-borderLight transition-all cursor-pointer group min-w-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-6 h-6 rounded-lg bg-obsidian-card text-obsidian-muted font-mono text-xs flex items-center justify-center font-bold flex-shrink-0">
                        #{idx + 1}
                      </span>
                      <PlatformIcon name={email.provider} size="sm" />
                      <div className="min-w-0">
                        <div className="font-semibold text-white text-xs group-hover:text-indigo-300 transition-colors truncate" title={email.address}>
                          {email.address}
                        </div>
                        <div className="text-[11px] text-obsidian-muted truncate">
                          Proveedor: {email.provider} • 2 pasos: <span className="uppercase text-indigo-400">{email.two_factor_method === 'none' ? 'Sin activar' : email.two_factor_method}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <div className="font-mono text-xs font-bold text-white">
                          {email.platform_count} cuentas {(email.prospect_count ?? 0) > 0 ? `• ${email.prospect_count} prosp.` : ''}
                        </div>
                        <div className="text-[10px] text-obsidian-muted truncate max-w-[140px]" title={email.recovery_email_address || 'Sin correo de respaldo'}>
                          {email.recovery_email_address ? `Respaldo: ${email.recovery_email_address}` : 'Sin correo de respaldo'}
                        </div>
                      </div>
                      <ArrowRight size={14} className="text-obsidian-muted group-hover:text-white transition-colors" />
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="py-8 px-4 rounded-xl bg-obsidian-surface/40 border border-obsidian-border text-center text-xs text-obsidian-muted space-y-2">
              <p>No hay cuentas de correo principales registradas.</p>
              <button
                type="button"
                onClick={() => {
                  if (!isUnlocked) openUnlockModal();
                  else openEmailModal();
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
              >
                <Mail size={13} />
                <span>Registrar Primer Correo Principal</span>
              </button>
            </div>
          )}
        </div>

        {/* Upcoming Renewals Calendar Widget */}
        <div className="p-6 rounded-2xl bg-obsidian-panel border border-obsidian-border space-y-4 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-2 truncate">
              <Clock size={16} className="text-indigo-400 flex-shrink-0" />
              <span className="truncate">Próximos Cobros y Vencimientos</span>
            </h2>
            <button
              onClick={() => setActiveSection('subscriptions')}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex-shrink-0"
            >
              Ver todos
            </button>
          </div>

          <div className="space-y-2.5">
            {realProfit.expiringSoonRenewals.slice(0, 3).map((ren) => (
              <div
                key={ren.id}
                onClick={() => setActiveSection('subscriptions')}
                className="p-3 rounded-xl bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/25 flex items-center justify-between gap-2 cursor-pointer transition-colors min-w-0"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-white text-xs truncate" title={ren.domain_or_service}>
                    {ren.domain_or_service}
                  </div>
                  <div className="text-[10px] text-amber-300 font-mono truncate">
                    {ren.client_name} • {ren.days_remaining <= 0 ? 'Vencido' : `En ${ren.days_remaining}d`}
                  </div>
                </div>
                <div className="font-mono text-xs font-bold text-amber-300 flex-shrink-0">
                  ${ren.renewal_cost} {ren.currency}
                </div>
              </div>
            ))}

            {upcomingBills.length > 0 ? (
              upcomingBills.map((b) => (
                <div
                  key={b.id}
                  onClick={() => openInspector('platform', b.id)}
                  className="p-3 rounded-xl bg-obsidian-surface/60 hover:bg-obsidian-surface border border-obsidian-border flex items-center justify-between gap-2 cursor-pointer transition-colors min-w-0"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <PlatformIcon name={b.name} iconUrl={b.icon_url} size="sm" />
                    <div className="min-w-0">
                      <div className="font-semibold text-white text-xs truncate" title={b.name}>{b.name}</div>
                      <div className="text-[11px] text-obsidian-muted font-mono truncate">{b.next_billing_date}</div>
                    </div>
                  </div>
                  <div className="font-mono text-xs font-bold text-emerald-400 flex-shrink-0">
                    ${b.subscription_cost} {b.currency}
                  </div>
                </div>
              ))
            ) : realProfit.expiringSoonRenewals.length === 0 ? (
              <div className="py-8 text-center text-xs text-obsidian-muted">
                No hay cobros ni vencimientos próximos.
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Quick Visual Map Banner */}
      <div 
        onClick={() => setActiveSection('graph')}
        className="p-5 rounded-2xl bg-gradient-to-r from-indigo-950/40 via-obsidian-panel to-obsidian-panel border border-indigo-500/20 hover:border-indigo-500/40 transition-all cursor-pointer group flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="p-2.5 rounded-2xl bg-indigo-500/20 text-indigo-300 group-hover:scale-105 transition-transform flex-shrink-0">
            <Network size={22} />
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors truncate">
              Abrir Mapa Visual de Conexiones entre Correos, Cuentas y Clientes
            </h3>
            <InfoTooltip content="Mira de forma gráfica qué servicios, tarjetas y páginas web dependen de cada correo principal." />
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-all flex-shrink-0">
          <span>Ver Mapa</span>
          <ArrowRight size={14} />
        </div>
      </div>
    </div>
  );
};
