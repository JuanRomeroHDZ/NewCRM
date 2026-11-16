import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Key, Lock, X } from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import type {
  ClientIncome,
  DomainRenewal,
  EmailAccount,
  OneTimeExpense,
  PaymentMethod,
  PlatformAccount,
  Prospect,
  VaultStatus,
  WriteupSummary,
  AuditLogItem,
  SecurityAuditResponse,
} from '../../types';
import { EmptyState } from '../common/EmptyState';
import { InlineErrorNotice } from '../common/InlineErrorNotice';
import { InfoTooltip } from '../common/InfoTooltip';
import {
  buildFollowUpMessage,
  buildMailtoUrl,
  buildWhatsAppUrl,
  computeCommercialPipelineSummary,
  formatDuration,
  isProspectNeedingRecontact,
} from '../../lib/prospectUtils';
import {
  computeFinancialExecutiveSummary,
  computeRealProfitAndRenewalsSummary,
  evaluateBudgetCap,
} from '../../lib/financeUtils';
import { needsExchangeRateReview } from '../../lib/exchangeRateReview';
import { DashboardAccountsSection } from './dashboard/DashboardAccountsSection';
import { DashboardFinanceSection } from './dashboard/DashboardFinanceSection';
import { DashboardMapLink } from './dashboard/DashboardMapLink';
import { DashboardMetrics } from './dashboard/DashboardMetrics';
import { DashboardProspectsSection, ProspectContactChannel } from './dashboard/DashboardProspectsSection';
import { formatApiDateTime } from '../../lib/dates';
import { projectCashflow90Days } from '../../lib/cashflowForecast';
import { DashboardActionCenter, DashboardActionTarget } from './dashboard/DashboardActionCenter';
import { DashboardForecastSection } from './dashboard/DashboardForecastSection';

export const DashboardView: React.FC = () => {
  const {
    setActiveSection,
    openInspector,
    openEmailModal,
    openProspectModal,
    isUnlocked,
    openUnlockModal,
    exchangeRate,
    dataVersion,
    showToast,
    triggerDataReload,
    activeScope,
    matchesScope,
    supportedCurrencies,
    baseCurrency,
    systemLocale,
  } = useVault();

  const [emails, setEmails] = useState<EmailAccount[]>([]);
  const [platforms, setPlatforms] = useState<PlatformAccount[]>([]);
  const [payments, setPayments] = useState<PaymentMethod[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [incomes, setIncomes] = useState<ClientIncome[]>([]);
  const [renewals, setRenewals] = useState<DomainRenewal[]>([]);
  const [expenses, setExpenses] = useState<OneTimeExpense[]>([]);
  const [vaultSettings, setVaultSettings] = useState<VaultStatus | null>(null);
  const [pipelineCurrency, setPipelineCurrency] = useState<string>(baseCurrency);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [partialDataWarning, setPartialDataWarning] = useState<string | null>(null);
  const [recentReports, setRecentReports] = useState<WriteupSummary[]>([]);
  const [recentEvents, setRecentEvents] = useState<AuditLogItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [securityAudit, setSecurityAudit] = useState<SecurityAuditResponse | null>(null);
  const [securityAuditLoading, setSecurityAuditLoading] = useState(true);
  const [securityAuditError, setSecurityAuditError] = useState(false);
  const [recentErrors, setRecentErrors] = useState<string[]>([]);
  const [dismissedRateNotice, setDismissedRateNotice] = useState(() => {
    try {
      return window.sessionStorage.getItem('newcrm.dashboard.exchange-rate-notice') || '';
    } catch {
      return '';
    }
  });
  // Evita que una respuesta antigua reemplace datos tras bloquear o recargar el panel.
  const loadGeneration = useRef(0);
  const hasLoadedDashboard = useRef(false);

  // El panel solo presenta monedas con conversión implementada.
  const pipelineCurrencyOptions = useMemo(() => {
    const allowedCurrencies = new Set(['MXN', 'USD']);
    return Array.from(new Set([baseCurrency, ...supportedCurrencies.map((currency) => currency.code)]))
      .filter((currency) => allowedCurrencies.has(currency));
  }, [supportedCurrencies, baseCurrency]);

  useEffect(() => {
    if (!pipelineCurrencyOptions.includes(pipelineCurrency)) setPipelineCurrency(baseCurrency);
  }, [baseCurrency, pipelineCurrency, pipelineCurrencyOptions]);

  const formatAmount = useCallback(
    (value: number | string | undefined | null, decimals = 2): string => {
      const num = typeof value === 'number' ? value : parseFloat(String(value ?? 0));
      const safe = Number.isFinite(num) ? num : 0;
      return safe.toLocaleString(systemLocale || 'es-MX', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    },
    [systemLocale]
  );

  const loadDashboardData = useCallback(async () => {
    const generation = ++loadGeneration.current;
    if (!isUnlocked) {
      setEmails([]);
      setPlatforms([]);
      setPayments([]);
      setProspects([]);
      setIncomes([]);
      setRenewals([]);
      setExpenses([]);
      setVaultSettings(null);
      hasLoadedDashboard.current = false;
      setLoadError(null);
      setPartialDataWarning(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    setPartialDataWarning(null);
    try {
      const [requiredData, optionalData] = await Promise.all([
        Promise.all([api.getEmails(), api.getPlatforms(), api.getPaymentMethods(), api.getProspects()]),
        Promise.allSettled([api.getIncomes(), api.getRenewals(), api.getExpenses(), api.getVaultStatus()]),
      ]);
      if (generation !== loadGeneration.current) return;

      const [emailList, platformList, paymentList, prospectList] = requiredData;
      const [incomeResult, renewalResult, expenseResult, settingsResult] = optionalData;
      const unavailableSections = [
        incomeResult.status === 'rejected' ? 'ingresos' : null,
        renewalResult.status === 'rejected' ? 'vencimientos' : null,
        expenseResult.status === 'rejected' ? 'gastos' : null,
        settingsResult.status === 'rejected' ? 'ajustes del presupuesto' : null,
      ].filter(Boolean);

      setEmails(emailList);
      setPlatforms(platformList);
      setPayments(paymentList);
      setProspects(prospectList);
      if (incomeResult.status === 'fulfilled') setIncomes(incomeResult.value);
      if (renewalResult.status === 'fulfilled') setRenewals(renewalResult.value);
      if (expenseResult.status === 'fulfilled') setExpenses(expenseResult.value);
      if (settingsResult.status === 'fulfilled') setVaultSettings(settingsResult.value);
      hasLoadedDashboard.current = true;
      setPartialDataWarning(
        unavailableSections.length > 0
          ? `No se pudieron actualizar ${unavailableSections.join(', ')}. Los importes pueden estar incompletos o desactualizados.`
          : null
      );
    } catch (error) {
      if (generation !== loadGeneration.current) return;
      const message = error instanceof Error ? error.message : 'No se pudo cargar el resumen del panel.';
      setLoadError(message);
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [isUnlocked]);

  useEffect(() => {
    void loadDashboardData();
    return () => {
      loadGeneration.current += 1;
    };
  }, [loadDashboardData, dataVersion]);

  useEffect(() => {
    let active = true;
    if (!isUnlocked) {
      setRecentReports([]);
      setRecentEvents([]);
      setRecentErrors([]);
      setRecentLoading(false);
      return () => { active = false; };
    }
    setRecentLoading(true);
    void Promise.allSettled([api.listWriteupsPage({ limit: 4, offset: 0 }), api.getAuditTrail(4, 0)])
      .then(([reports, events]) => {
        if (!active) return;
        setRecentReports(reports.status === 'fulfilled' ? reports.value.items : []);
        setRecentEvents(events.status === 'fulfilled' ? events.value.items : []);
        setRecentErrors([reports.status === 'rejected' ? 'informes' : '', events.status === 'rejected' ? 'actividad' : ''].filter(Boolean));
      })
      .finally(() => { if (active) setRecentLoading(false); });
    return () => { active = false; };
  }, [isUnlocked, dataVersion]);

  useEffect(() => {
    let active = true;
    if (!isUnlocked) {
      setSecurityAudit(null);
      setSecurityAuditLoading(false);
      setSecurityAuditError(false);
      return () => { active = false; };
    }
    setSecurityAuditLoading(true);
    setSecurityAuditError(false);
    void api.getSecurityHealth()
      .then((data) => { if (active) setSecurityAudit(data); })
      .catch(() => { if (active) { setSecurityAudit(null); setSecurityAuditError(true); } })
      .finally(() => { if (active) setSecurityAuditLoading(false); });
    return () => { active = false; };
  }, [isUnlocked, dataVersion]);

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const handleMarkResponded = async (event: React.MouseEvent, prospect: Prospect) => {
    event.stopPropagation();
    try {
      const updated = await api.markProspectResponded(prospect.id);
      showToast(
        updated.sla_status === 'cumplido'
          ? `Respondido a tiempo: “${updated.company_name}” respondió en ${formatDuration(updated.response_time_seconds ?? updated.elapsed_seconds)}.`
          : `Respuesta registrada para “${updated.company_name}”.`,
        updated.sla_status === 'cumplido' ? 'success' : 'info'
      );
      triggerDataReload();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Error al registrar respuesta', 'error');
    }
  };

  const handleQuickContact = async (event: React.MouseEvent, prospect: Prospect, channel: ProspectContactChannel) => {
    event.stopPropagation();
    try {
      const message = buildFollowUpMessage(prospect);
      if (channel === 'whatsapp') {
        const url = buildWhatsAppUrl(prospect.whatsapp, prospect.company_name, prospect.demo_url, message);
        if (!url) {
          showToast('Este prospecto no tiene número de WhatsApp configurado.', 'error');
          return;
        }
        window.open(url, '_blank', 'noopener,noreferrer');
      } else if (channel === 'email') {
        const url = buildMailtoUrl(prospect);
        if (!url) {
          showToast('Este prospecto no tiene correo electrónico vinculado.', 'error');
          return;
        }
        window.location.href = url;
      } else {
        await navigator.clipboard.writeText(message);
      }

      showToast(
        channel === 'template_copy'
          ? 'Mensaje copiado. Registra el contacto después de enviarlo.'
          : 'Mensaje preparado. Registra el contacto después de enviarlo.',
        'info'
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Error al preparar el seguimiento', 'error');
    }
  };

  const filteredEmails = useMemo(() => emails.filter((email) => matchesScope(email.scope)), [emails, matchesScope]);
  const filteredPlatforms = useMemo(() => platforms.filter((platform) => matchesScope(platform.scope)), [platforms, matchesScope]);
  const filteredProspects = useMemo(() => prospects.filter((prospect) => matchesScope(prospect.scope)), [prospects, matchesScope]);
  const filteredIncomes = useMemo(() => incomes.filter((income) => matchesScope(income.scope)), [incomes, matchesScope]);
  const filteredRenewals = useMemo(() => renewals.filter((renewal) => matchesScope(renewal.scope)), [renewals, matchesScope]);
  const filteredExpenses = useMemo(() => expenses.filter((expense) => matchesScope(expense.scope)), [expenses, matchesScope]);
  const scopedSecurityAudit = useMemo(() => {
    if (!securityAudit || activeScope === 'all') return securityAudit;
    const emailIds = new Set(filteredEmails.map((email) => email.id));
    const platformIds = new Set(filteredPlatforms.map((platform) => platform.id));
    const matchesEntity = (item: { id: string; type?: string }) => item.type === 'email' ? emailIds.has(item.id) : platformIds.has(item.id);
    const reuseGroups = securityAudit.reuse_groups.map((group) => {
      const entities = group.entities.filter(matchesEntity);
      return { ...group, entities, count: entities.length };
    }).filter((group) => group.count > 1);
    const apiKeyAlerts = (securityAudit.api_key_alerts || []).filter((alert) => platformIds.has(alert.platform_id));
    const weakAccounts = securityAudit.weak_accounts.filter(matchesEntity);
    const staleAccounts = (securityAudit.stale_accounts || []).filter(matchesEntity);
    return {
      ...securityAudit,
      health_score: null,
      total_accounts: emailIds.size + platformIds.size,
      email_accounts_count: emailIds.size,
      weak_accounts: weakAccounts,
      weak_passwords_count: weakAccounts.length,
      reuse_groups: reuseGroups,
      reused_passwords_count: reuseGroups.reduce((count, group) => count + group.count, 0),
      unprotected_emails: securityAudit.unprotected_emails.filter((email) => emailIds.has(email.id)),
      no_2fa_emails_count: securityAudit.unprotected_emails.filter((email) => emailIds.has(email.id)).length,
      stale_accounts: staleAccounts,
      stale_passwords_count: staleAccounts.length,
      api_key_alerts: apiKeyAlerts,
      expired_api_keys_count: apiKeyAlerts.filter((alert) => alert.status === 'expired').length,
      expiring_api_keys_count: apiKeyAlerts.filter((alert) => alert.status === 'expiring_soon').length,
    };
  }, [securityAudit, activeScope, filteredEmails, filteredPlatforms]);

  const fin = useMemo(
    () => computeFinancialExecutiveSummary(platforms, payments, exchangeRate?.rate, activeScope, expenses),
    [platforms, payments, exchangeRate?.rate, activeScope, expenses]
  );
  const realProfit = useMemo(
    () => computeRealProfitAndRenewalsSummary(incomes, renewals, fin, exchangeRate?.rate, expenses, activeScope),
    [incomes, renewals, fin, exchangeRate?.rate, expenses, activeScope]
  );
  const budgetCapEval = useMemo(
    () => evaluateBudgetCap(
      fin.monthlyMXN,
      fin.peakMonth.totalMXN,
      vaultSettings?.budget_cap_amount || 0,
      vaultSettings?.budget_cap_currency || baseCurrency,
      fin.usdRate
    ),
    [fin, vaultSettings, baseCurrency]
  );
  const pipelineSummary = useMemo(
    () => computeCommercialPipelineSummary(filteredProspects, fin.usdRate, fin.monthlyMXN),
    [filteredProspects, fin.usdRate, fin.monthlyMXN]
  );
  const cashflowForecast = useMemo(() => projectCashflow90Days({
    platforms: filteredPlatforms,
    incomes: filteredIncomes,
    renewals: filteredRenewals,
    expenses: filteredExpenses,
    usdRate: exchangeRate?.rate,
    activeScope,
  }), [filteredPlatforms, filteredIncomes, filteredRenewals, filteredExpenses, exchangeRate?.rate, activeScope]);

  const rateUpdatedAt = exchangeRate?.updated_at;
  const parsedRateUpdatedAt = rateUpdatedAt
    ? Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(rateUpdatedAt) ? rateUpdatedAt : `${rateUpdatedAt}Z`)
    : Number.NaN;
  const exchangeRateNeedsReview = needsExchangeRateReview(exchangeRate);
  const rateNoticeSignature = exchangeRate
    ? `${exchangeRate.is_manual}:${exchangeRate.updated_at}:${exchangeRate.rate}`
    : 'missing';
  const showRateNotice = exchangeRateNeedsReview && dismissedRateNotice !== rateNoticeSignature;
  const rateNoticeHelp = !exchangeRate
    ? 'No hay una cotización disponible. Actualízala antes de usar los totales convertidos.'
    : Number.isFinite(parsedRateUpdatedAt)
      ? 'La última actualización tiene más de 24 horas. Revísalo antes de usar los totales convertidos.'
      : 'No se pudo comprobar la fecha de actualización. Revisa el tipo de cambio antes de usar los totales convertidos.';

  const dismissRateNotice = () => {
    setDismissedRateNotice(rateNoticeSignature);
    try {
      window.sessionStorage.setItem('newcrm.dashboard.exchange-rate-notice', rateNoticeSignature);
    } catch {
      // El aviso sigue oculto durante esta sesión aunque el navegador no permita guardar preferencias.
    }
  };

  const ssoCount = filteredPlatforms.filter((platform) => platform.access_type === 'sso').length;
  const ownPasswordCount = filteredPlatforms.filter((platform) => platform.access_type === 'own_password').length;
  const ssoPercentage = filteredPlatforms.length ? Math.round((ssoCount / filteredPlatforms.length) * 100) : 0;
  const emailsWithout2FA = filteredEmails.filter((email) => email.two_factor_method === 'none');
  const protectedEmailsCount = Math.max(0, filteredEmails.length - emailsWithout2FA.length);
  const recontactProspects = useMemo(
    () => filteredProspects.filter((prospect) => prospect.status !== 'archivado_frio' && isProspectNeedingRecontact(prospect, nowMs)),
    [filteredProspects, nowMs]
  );
  const upcomingBills = useMemo(
    () => filteredPlatforms
      .filter((platform) => platform.next_billing_date && platform.subscription_status === 'active')
      .sort((a, b) => (a.next_billing_date! > b.next_billing_date! ? 1 : -1))
      .slice(0, 5),
    [filteredPlatforms]
  );

  if (!isUnlocked) {
    return (
      <div className="mx-auto max-w-xl space-y-4 p-4 pt-12 text-center animate-fadeIn sm:p-8 sm:pt-24">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-amber-500/20 bg-amber-500/10 text-amber-400">
          <Lock size={32} aria-hidden="true" />
        </div>
        <div className="flex items-center justify-center gap-2">
        <h2 className="text-xl font-bold text-white">Panel de control protegido</h2>
          <InfoTooltip title="Bóveda bloqueada" content="Desbloquea con tu contraseña de acceso para ver tus finanzas y prospectos." />
        </div>
        <p className="text-xs text-obsidian-muted">Tus métricas permanecen protegidas mientras la sesión está bloqueada.</p>
        <button type="button" onClick={openUnlockModal} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
          <Key size={14} aria-hidden="true" /> Desbloquear
        </button>
      </div>
    );
  }

  if (loading && !hasLoadedDashboard.current) {
    return (
      <div role="status" aria-label="Cargando panel de control" className="mx-auto max-w-7xl min-w-0 space-y-5 p-3 sm:space-y-7 sm:p-8 animate-fadeIn">
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-20 rounded-xl border border-obsidian-border bg-obsidian-panel p-4 animate-pulse" />)}
        </div>
        <div className="h-52 rounded-xl border border-obsidian-border bg-obsidian-panel p-5 animate-pulse" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="h-56 rounded-xl border border-obsidian-border bg-obsidian-panel p-5 lg:col-span-2 animate-pulse" />
          <div className="h-56 rounded-xl border border-obsidian-border bg-obsidian-panel p-5 animate-pulse" />
        </div>
      </div>
    );
  }

  if (loadError && !hasLoadedDashboard.current) {
    return (
      <div className="mx-auto max-w-3xl p-4 sm:p-8 animate-fadeIn">
        <EmptyState tone="error" icon={AlertTriangle} title="No se pudo cargar el panel" description={loadError} actionLabel="Reintentar" onAction={loadDashboardData} />
      </div>
    );
  }

  const activePipelineAmount = pipelineCurrency === 'USD' ? pipelineSummary.activePipelineUSD : pipelineSummary.activePipelineMXN;
  const closedWonAmount = pipelineCurrency === 'USD' ? pipelineSummary.closedWonUSD : pipelineSummary.closedWonMXN;
  const openSubscriptions = () => setActiveSection('subscriptions');
  const handleOpenAction = (target: DashboardActionTarget, entityId?: string) => {
    if (target === 'email' && entityId) { openInspector('email', entityId); return; }
    if (target === 'platform' && entityId) { openInspector('platform', entityId); return; }
    if (target === 'security') { setActiveSection('security_audit'); return; }
    if (target === 'emails') { setActiveSection('emails'); return; }
    setActiveSection('subscriptions');
  };

  return (
    <div className="mx-auto max-w-7xl min-w-0 space-y-6 p-3 sm:space-y-8 sm:p-8 animate-fadeIn">
      {loading && hasLoadedDashboard.current && (
        <p role="status" className="text-xs text-obsidian-muted">
          Actualizando el resumen. Se mantienen visibles los últimos datos cargados.
        </p>
      )}
      {loadError && hasLoadedDashboard.current && (
        <InlineErrorNotice
          title="No se pudo actualizar el resumen"
          description={`${loadError} Se muestran los últimos datos cargados.`}
          actionLabel="Reintentar"
          onAction={() => void loadDashboardData()}
        />
      )}
      {showRateNotice && (
        <div role="status" className="flex min-w-0 items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-200 sm:px-3">
          <AlertTriangle size={14} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">El tipo de cambio necesita revisión.</span>
          <InfoTooltip title="Tipo de cambio" content={rateNoticeHelp} position="bottom" />
          <button type="button" onClick={dismissRateNotice} aria-label="Ocultar aviso de tipo de cambio" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-amber-200/80 hover:bg-amber-500/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}
      {partialDataWarning && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          <span>{partialDataWarning}</span>
          <button type="button" onClick={() => void loadDashboardData()} className="shrink-0 font-semibold underline underline-offset-2 hover:text-white">Reintentar</button>
        </div>
      )}

      <DashboardMetrics
        monthlyMXN={fin.monthlyMXN}
        monthlyUSD={fin.monthlyUSD}
        weeklyMXN={fin.weeklyMXN}
        netMonthMXN={realProfit.netMonthMXN}
        monthIncomeMXN={realProfit.monthIncomeMXN}
        netYearMXN={realProfit.netYearMXN}
        ssoPercentage={ssoPercentage}
        ssoCount={ssoCount}
        ownPasswordCount={ownPasswordCount}
        protectedEmailsCount={protectedEmailsCount}
        emailCount={filteredEmails.length}
        emailsWithout2FA={emailsWithout2FA.length}
        formatAmount={formatAmount}
      />

      <DashboardFinanceSection
        fin={fin}
        realProfit={realProfit}
        pipelineSummary={pipelineSummary}
        budgetCapEval={budgetCapEval}
        pipelineCurrency={pipelineCurrency}
        pipelineCurrencyOptions={pipelineCurrencyOptions}
        activePipelineAmount={activePipelineAmount}
        closedWonAmount={closedWonAmount}
        formatAmount={formatAmount}
        onCurrencyChange={setPipelineCurrency}
        onOpenSubscriptions={openSubscriptions}
      />

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
        <DashboardActionCenter
          emails={filteredEmails}
          platforms={filteredPlatforms}
          renewals={filteredRenewals}
          incomes={filteredIncomes}
          securityAudit={scopedSecurityAudit}
          securityLoading={securityAuditLoading}
          securityError={securityAuditError}
          onOpen={handleOpenAction}
        />
        <DashboardForecastSection forecast={cashflowForecast} formatAmount={formatAmount} onOpenFinance={openSubscriptions} />
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-6 min-[680px]:grid-cols-2">
      <DashboardProspectsSection
        prospects={filteredProspects}
        recontactCount={recontactProspects.length}
        nowMs={nowMs}
        onOpenProspects={() => setActiveSection('prospects')}
        onCreateProspect={() => openProspectModal()}
        onOpenProspect={(prospectId) => openInspector('prospect', String(prospectId))}
        onQuickContact={handleQuickContact}
        onMarkResponded={handleMarkResponded}
      />

      <section className="min-w-0 rounded-xl border border-obsidian-border bg-obsidian-panel p-4 sm:p-5" aria-labelledby="dashboard-recent-title">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="dashboard-recent-title" className="font-serif text-base font-semibold text-white">Informes y actividad reciente</h2><div className="flex items-center gap-4"><DashboardMapLink onOpen={() => setActiveSection('graph')} /><button type="button" onClick={() => setActiveSection('writeups')} className="min-h-9 rounded-sm text-xs text-emerald-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">Ver informes <ArrowRight size={12} className="inline" /></button></div></div>
        <p className="mt-1 text-xs text-obsidian-muted">Actividad general de la instalación; no depende del filtro de ámbito.</p>
        {recentErrors.length > 0 && <p role="status" className="mt-3 text-xs text-amber-200">No se pudo cargar: {recentErrors.join(' y ')}.</p>}
        <h3 className="mt-4 text-xs font-semibold text-white">Informes actualizados</h3>
        {recentLoading ? <p role="status" className="mt-2 text-xs text-obsidian-muted">Cargando informes…</p> : recentReports.length ? <ul className="mt-1 divide-y divide-obsidian-border">{recentReports.map((report) => <li key={report.id} className="flex min-w-0 items-baseline justify-between gap-3 py-2"><span className="min-w-0 truncate text-sm text-obsidian-text" title={report.title}>{report.title}</span><time dateTime={report.updated_at} className="shrink-0 text-xs text-obsidian-muted">{formatApiDateTime(report.updated_at, systemLocale || 'es-MX')}</time></li>)}</ul> : !recentErrors.includes('informes') && <p className="mt-2 text-xs text-obsidian-muted">Aún no hay informes.</p>}
        <div className="mt-4 flex items-center justify-between gap-2"><h3 className="text-xs font-semibold text-white">Últimos registros</h3><button type="button" onClick={() => setActiveSection('audit_logs')} className="min-h-9 rounded-sm text-xs text-emerald-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">Ver historial</button></div>
        {recentLoading ? <p role="status" className="mt-2 text-xs text-obsidian-muted">Cargando actividad…</p> : recentEvents.length ? <ul className="mt-1 divide-y divide-obsidian-border">{recentEvents.map((event) => <li key={event.id} className="flex min-w-0 items-baseline justify-between gap-3 py-2"><span className="min-w-0 truncate text-xs text-obsidian-text">{event.action} · {event.entity_type}</span><time dateTime={event.timestamp} className="shrink-0 text-xs text-obsidian-muted">{formatApiDateTime(event.timestamp, systemLocale || 'es-MX')}</time></li>)}</ul> : !recentErrors.includes('actividad') && <p className="mt-2 text-xs text-obsidian-muted">Aún no hay registros.</p>}
      </section>
      </div>

      <DashboardAccountsSection
        emails={filteredEmails}
        renewals={realProfit.expiringSoonRenewals}
        upcomingBills={upcomingBills}
        onOpenEmail={(emailId) => openInspector('email', emailId)}
        onOpenEmails={() => setActiveSection('emails')}
        onCreateEmail={() => openEmailModal()}
        onOpenPlatform={(platformId) => openInspector('platform', platformId)}
        onOpenSubscriptions={openSubscriptions}
      />

    </div>
  );
};
