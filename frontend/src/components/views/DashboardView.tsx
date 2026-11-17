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
  SecurityAuditResponse,
} from '../../types';
import { EmptyState } from '../common/EmptyState';
import { InlineErrorNotice } from '../common/InlineErrorNotice';
import { InfoTooltip } from '../common/InfoTooltip';
import {
  isProspectNeedingRecontact,
} from '../../lib/prospectUtils';
import {
  computeFinancialExecutiveSummary,
  computeRealProfitAndRenewalsSummary,
} from '../../lib/financeUtils';
import { needsExchangeRateReview } from '../../lib/exchangeRateReview';
import { DashboardMetrics } from './dashboard/DashboardMetrics';
import { GlobalModuleDirectory } from './ModuleOverviewView';

export const DashboardView: React.FC = () => {
  const {
    isUnlocked,
    openUnlockModal,
    exchangeRate,
    dataVersion,
    activeScope,
    matchesScope,
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [partialDataWarning, setPartialDataWarning] = useState<string | null>(null);
  const [writeupCount, setWriteupCount] = useState<number | null>(null);
  const [activityCount, setActivityCount] = useState<number | null>(null);
  const [securityAudit, setSecurityAudit] = useState<SecurityAuditResponse | null>(null);
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
      setWriteupCount(null);
      setActivityCount(null);
      return () => { active = false; };
    }
    void Promise.allSettled([api.listWriteupsPage({ limit: 1, offset: 0 }), api.getAuditTrail(1, 0)])
      .then(([reports, events]) => {
        if (!active) return;
        setWriteupCount(reports.status === 'fulfilled' ? reports.value.total : null);
        setActivityCount(events.status === 'fulfilled' ? events.value.total : null);
      })
    return () => { active = false; };
  }, [isUnlocked, dataVersion]);

  useEffect(() => {
    let active = true;
    if (!isUnlocked) {
      setSecurityAudit(null);
      return () => { active = false; };
    }
    void api.getSecurityHealth()
      .then((data) => { if (active) setSecurityAudit(data); })
      .catch(() => { if (active) setSecurityAudit(null); });
    return () => { active = false; };
  }, [isUnlocked, dataVersion]);

  const filteredEmails = useMemo(() => emails.filter((email) => matchesScope(email.scope)), [emails, matchesScope]);
  const filteredPlatforms = useMemo(() => platforms.filter((platform) => matchesScope(platform.scope)), [platforms, matchesScope]);
  const filteredProspects = useMemo(() => prospects.filter((prospect) => matchesScope(prospect.scope)), [prospects, matchesScope]);
  const filteredIncomes = useMemo(() => incomes.filter((income) => matchesScope(income.scope)), [incomes, matchesScope]);
  const filteredRenewals = useMemo(() => renewals.filter((renewal) => matchesScope(renewal.scope)), [renewals, matchesScope]);
  const filteredExpenses = useMemo(() => expenses.filter((expense) => matchesScope(expense.scope)), [expenses, matchesScope]);
  const filteredPaymentMethods = useMemo(() => payments.filter((payment) => matchesScope(payment.scope)), [payments, matchesScope]);
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
    () => filteredProspects.filter((prospect) => prospect.status !== 'archivado_frio' && isProspectNeedingRecontact(prospect, Date.now())),
    [filteredProspects]
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
        <button type="button" onClick={openUnlockModal} className="ui-action-primary">{/* [Acción principal] Inicia o confirma la tarea de este espacio. */}
          <Key size={16} aria-hidden="true" /> Desbloquear
        </button>
      </div>
    );
  }

  if (loading && !hasLoadedDashboard.current) {
    return (
      <div role="status" aria-label="Cargando panel de control" className="mx-auto max-w-7xl min-w-0 space-y-6 p-4 sm:p-6 animate-fadeIn">
        <div className="h-32 rounded-xl border border-obsidian-border bg-obsidian-panel animate-pulse" />
        <div className="space-y-4">
          <div className="h-6 w-28 rounded bg-obsidian-surface animate-pulse" />
          {[0, 1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="h-14 border-b border-obsidian-border animate-pulse" />)}
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

  return (
    <div className="mx-auto max-w-7xl min-w-0 space-y-6 p-4 sm:p-6 animate-fadeIn">
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
        <div role="status" className="flex min-w-0 items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 sm:px-3">
          <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">El tipo de cambio necesita revisión.</span>
          <InfoTooltip title="Tipo de cambio" content={rateNoticeHelp} position="bottom" />
          <button type="button" onClick={dismissRateNotice} aria-label="Ocultar aviso de tipo de cambio" className="ui-action-icon shrink-0 items-center">{/* [Icono] Mantiene disponible esta acción en su contexto. */}
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
      {partialDataWarning && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          <span>{partialDataWarning}</span>
          <button type="button" onClick={() => void loadDashboardData()} className="ui-action-secondary">{/* [Acción secundaria] Permite volver o reintentar sin modificar otros datos. */}Reintentar</button>
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
      <GlobalModuleDirectory metrics={{
        overview_prospection: `${filteredProspects.length} prospectos · ${recontactProspects.length} por contactar`,
        overview_communications: `${filteredEmails.length} correos · ${filteredPlatforms.length} servicios · ${protectedEmailsCount} protegidos en dos pasos`,
        overview_finances: `${filteredIncomes.length} pagos · ${filteredRenewals.length} vencimientos · ${filteredExpenses.length} gastos · ${filteredPaymentMethods.length} métodos de pago`,
        overview_security: `${writeupCount === null ? 'Informes no disponibles' : `${writeupCount} informes`} · ${scopedSecurityAudit?.health_score === null || scopedSecurityAudit?.health_score === undefined ? 'estado sin puntaje' : `seguridad ${scopedSecurityAudit.health_score}/100`}`,
        overview_activity: `${activityCount === null ? 'Actividad no disponible' : `${activityCount} registros globales · sin filtro de ámbito`} · acceso a la papelera desde su vista`,
        overview_settings: `Bloqueo automático en ${vaultSettings?.timeout_minutes ?? '—'} min · ajustes protegidos`,
      }} />

    </div>
  );
};
