import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Key, Lock, X } from 'lucide-react';
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
} from '../../types';
import { EmptyState } from '../common/EmptyState';
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
  const [dismissedRateNotice, setDismissedRateNotice] = useState(() => {
    try {
      return window.sessionStorage.getItem('newcrm.dashboard.exchange-rate-notice') || '';
    } catch {
      return '';
    }
  });
  // Evita que una respuesta antigua reemplace datos tras bloquear o recargar el panel.
  const loadGeneration = useRef(0);

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
      const incomeList = incomeResult.status === 'fulfilled' ? incomeResult.value : [];
      const renewalList = renewalResult.status === 'fulfilled' ? renewalResult.value : [];
      const expenseList = expenseResult.status === 'fulfilled' ? expenseResult.value : [];
      const vaultStatus = settingsResult.status === 'fulfilled' ? settingsResult.value : null;
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
      setIncomes(incomeList);
      setRenewals(renewalList);
      setExpenses(expenseList);
      setVaultSettings(vaultStatus);
      setPartialDataWarning(
        unavailableSections.length > 0
          ? `No se pudieron cargar ${unavailableSections.join(', ')}. Algunos totales pueden estar incompletos.`
          : null
      );
    } catch (error) {
      if (generation !== loadGeneration.current) return;
      const message = error instanceof Error ? error.message : 'No se pudo cargar el resumen del panel.';
      setLoadError(message);
      showToast(message, 'error');
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [isUnlocked, showToast]);

  useEffect(() => {
    void loadDashboardData();
    return () => {
      loadGeneration.current += 1;
    };
  }, [loadDashboardData, dataVersion]);

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
  const expiringTrials = filteredPlatforms.filter((platform) => platform.subscription_status === 'free_trial');
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
          <h2 className="text-xl font-bold tracking-tight text-white">Panel de control protegido</h2>
          <InfoTooltip title="Bóveda bloqueada" content="Desbloquea con tu contraseña de acceso para ver tus finanzas y prospectos." />
        </div>
        <p className="text-xs text-obsidian-muted">Tus métricas permanecen protegidas mientras la sesión está bloqueada.</p>
        <button type="button" onClick={openUnlockModal} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
          <Key size={14} aria-hidden="true" /> Desbloquear
        </button>
      </div>
    );
  }

  if (loading) {
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

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl p-4 sm:p-8 animate-fadeIn">
        <EmptyState tone="error" icon={AlertTriangle} title="No se pudo cargar el panel" description={loadError} actionLabel="Reintentar" onAction={loadDashboardData} />
      </div>
    );
  }

  const activePipelineAmount = pipelineCurrency === 'USD' ? pipelineSummary.activePipelineUSD : pipelineSummary.activePipelineMXN;
  const closedWonAmount = pipelineCurrency === 'USD' ? pipelineSummary.closedWonUSD : pipelineSummary.closedWonMXN;
  const openSubscriptions = () => setActiveSection('subscriptions');

  return (
    <div className="mx-auto max-w-7xl min-w-0 space-y-6 p-3 sm:space-y-8 sm:p-8 animate-fadeIn">
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

      {expiringTrials.length > 0 && (
        <section className="flex min-w-0 flex-col items-start justify-between gap-3 border-y border-amber-500/30 py-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-start gap-3">
            <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="text-xs font-bold text-white">Pruebas gratis próximas a cobrarse ({expiringTrials.length})</h2>
              <div className="mt-1 flex flex-wrap gap-2">
                {expiringTrials.map((trial) => (
                  <button key={trial.id} type="button" onClick={() => openInspector('platform', trial.id)} className="max-w-full truncate text-[11px] text-amber-200 underline decoration-amber-500/40 underline-offset-2 hover:text-white">
                    {trial.name} · {trial.trial_end_date || trial.next_billing_date}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button type="button" onClick={openSubscriptions} className="shrink-0 text-xs font-semibold text-amber-300 hover:text-white">Ver todos</button>
        </section>
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

      <DashboardMapLink onOpen={() => setActiveSection('graph')} />
    </div>
  );
};
