import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CreditCard, Plus, DollarSign, RefreshCw, Edit2,
  Globe, Receipt, Lock, AlertTriangle
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import {
  PaymentMethod, PlatformAccount, Prospect, BillingRecord, VaultStatus,
  ClientIncome, DomainRenewal, IncomeCategory, IncomeStatus, RenewalServiceType, RenewalPaidBy,
  OneTimeExpense, EntityScope, AdvanceRenewalPayload
} from '../../types';
import { InfoTooltip } from '../common/InfoTooltip';
import { EmptyState } from '../common/EmptyState';
import {
  computeFinancialExecutiveSummary, evaluateBudgetCap,
  computeRealProfitAndRenewalsSummary
} from '../../lib/financeUtils';
import { computeCommercialPipelineSummary } from '../../lib/prospectUtils';
import { INPUT_LIMITS } from '../../lib/validation';
import { FinancialExecutiveSummary } from './subscriptions/FinancialExecutiveSummary';
import { SubscriptionsLists } from './subscriptions/SubscriptionsLists';
import { SubscriptionsModals, EXPENSE_CATEGORIES } from './subscriptions/SubscriptionsModals';

export const SubscriptionsView: React.FC = () => {
  const {
    isUnlocked, openUnlockModal, openPaymentModal,
    openInspector, exchangeRate, refreshExchangeRate,
    showToast, triggerDataReload, dataVersion, setActiveSection,
    activeScope, matchesScope, defaultEntityScope,
    confirm, supportedCurrencies, baseCurrency, systemLocale, runtimeConfig
  } = useVault();

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [platforms, setPlatforms] = useState<PlatformAccount[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [incomes, setIncomes] = useState<ClientIncome[]>([]);
  const [renewals, setRenewals] = useState<DomainRenewal[]>([]);
  const [expenses, setExpenses] = useState<OneTimeExpense[]>([]);
  const [billingHistory, setBillingHistory] = useState<BillingRecord[]>([]);
  const [vaultSettings, setVaultSettings] = useState<VaultStatus | null>(null);
  const [manualRateInput, setManualRateInput] = useState<string>('');
  const [isEditingRate, setIsEditingRate] = useState(false);
  const [isSyncingRate, setIsSyncingRate] = useState(false);

  const secondaryCurrency = useMemo(() => {
    const other = supportedCurrencies.find((c) => c.code !== baseCurrency)?.code;
    if (other) return other;
    if (exchangeRate?.target_currency && exchangeRate.target_currency !== baseCurrency) {
      return exchangeRate.target_currency;
    }
    return baseCurrency === 'USD' ? 'MXN' : 'USD';
  }, [supportedCurrencies, baseCurrency, exchangeRate]);

  const currencyOptions = useMemo(() => {
    const codes = supportedCurrencies.map((c) => c.code);
    return Array.from(new Set([baseCurrency, ...codes, secondaryCurrency].filter(Boolean)));
  }, [supportedCurrencies, baseCurrency, secondaryCurrency]);

  const exchangePairBase =
    exchangeRate?.base_currency ||
    runtimeConfig?.currency_config?.exchange_pair?.base ||
    'USD';
  const exchangePairTarget =
    exchangeRate?.target_currency ||
    runtimeConfig?.currency_config?.exchange_pair?.target ||
    baseCurrency;

  // Budget Cap inline editing state
  const [isEditingCap, setIsEditingCap] = useState(false);
  const [capAmountInput, setCapAmountInput] = useState<string>('');
  const [capCurrencyInput, setCapCurrencyInput] = useState<string>(baseCurrency);
  const [pipelineCurrencyView, setPipelineCurrencyView] = useState<string>(baseCurrency);
  const [profitCurrencyView, setProfitCurrencyView] = useState<string>(baseCurrency);

  // Income Modal State
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
  const [editingIncome, setEditingIncome] = useState<ClientIncome | null>(null);
  const [incClientName, setIncClientName] = useState('');
  const [incProspectId, setIncProspectId] = useState('');
  const [incConcept, setIncConcept] = useState('');
  const [incCategory, setIncCategory] = useState<IncomeCategory>('anticipo');
  const [incAmount, setIncAmount] = useState('');
  const [incCurrency, setIncCurrency] = useState<string>(baseCurrency);
  const [incStatus, setIncStatus] = useState<IncomeStatus>('cobrado');
  const [incDate, setIncDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [incMethod, setIncMethod] = useState('Transferencia SPEI');
  const [incRecurring, setIncRecurring] = useState(false);
  const [incScope, setIncScope] = useState<EntityScope>('business');
  const [incNotes, setIncNotes] = useState('');
  const [savingIncome, setSavingIncome] = useState(false);
  const [showQuickClientInInc, setShowQuickClientInInc] = useState(false);
  const [quickClientNameInInc, setQuickClientNameInInc] = useState('');
  const [creatingQuickClientInInc, setCreatingQuickClientInInc] = useState(false);

  // Domain/Hosting Renewal Modal State
  const [isRenewalModalOpen, setIsRenewalModalOpen] = useState(false);
  const [editingRenewal, setEditingRenewal] = useState<DomainRenewal | null>(null);
  const [renClientName, setRenClientName] = useState('');
  const [renProspectId, setRenProspectId] = useState('');
  const [renPlatformId, setRenPlatformId] = useState('');
  const [renDomainOrService, setRenDomainOrService] = useState('');
  const [renServiceType, setRenServiceType] = useState<RenewalServiceType>('dominio');
  const [renProvider, setRenProvider] = useState('');
  const [renDate, setRenDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split('T')[0];
  });
  const [renCost, setRenCost] = useState('');
  const [renCurrency, setRenCurrency] = useState<string>(baseCurrency);
  const [renCycle, setRenCycle] = useState<'yearly' | 'monthly'>('yearly');
  const [renPaidBy, setRenPaidBy] = useState<RenewalPaidBy>('client');
  const [renClientCharge, setRenClientCharge] = useState('');
  const [renScope, setRenScope] = useState<EntityScope>('business');
  const [renAutoRenew, setRenAutoRenew] = useState(false);
  const [renNotes, setRenNotes] = useState('');
  const [savingRenewal, setSavingRenewal] = useState(false);
  const [showQuickClientInRen, setShowQuickClientInRen] = useState(false);
  const [quickClientNameInRen, setQuickClientNameInRen] = useState('');
  const [creatingQuickClientInRen, setCreatingQuickClientInRen] = useState(false);

  // Atomic Advance Renewal Modal State
  const [advanceRenewalTarget, setAdvanceRenewalTarget] = useState<DomainRenewal | null>(null);
  const [advanceCreateIncome, setAdvanceCreateIncome] = useState(true);
  const [advanceChargedAmount, setAdvanceChargedAmount] = useState('');
  const [advancingRenewal, setAdvancingRenewal] = useState(false);

  // One-Time Expense Modal State
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<OneTimeExpense | null>(null);
  const [expTitle, setExpTitle] = useState('');
  const [expCategory, setExpCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [expAmount, setExpAmount] = useState('');
  const [expCurrency, setExpCurrency] = useState<string>(baseCurrency);
  const [expDate, setExpDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [expScope, setExpScope] = useState<EntityScope>('business');
  const [expPaymentMethodId, setExpPaymentMethodId] = useState('');
  const [expPaymentMethodLabel, setExpPaymentMethodLabel] = useState('');
  const [expNotes, setExpNotes] = useState('');
  const [savingExpense, setSavingExpense] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  const loadData = useCallback(async () => {
    if (!isUnlocked) {
      setLoading(false);
      setLoadError(null);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [payList, platList, prospList, incList, renList, expList, billHist, vStatus] = await Promise.all([
        api.getPaymentMethods(),
        api.getPlatforms(),
        api.getProspects(),
        api.getIncomes().catch(() => [] as ClientIncome[]),
        api.getRenewals().catch(() => [] as DomainRenewal[]),
        api.getExpenses().catch(() => [] as OneTimeExpense[]),
        api.getBillingHistory(12).catch(() => [] as BillingRecord[]),
        api.getVaultStatus().catch(() => null),
      ]);
      setPaymentMethods(payList);
      setPlatforms(platList);
      setProspects(prospList);
      setIncomes(incList);
      setRenewals(renList);
      setExpenses(expList);
      setBillingHistory(billHist);
      if (vStatus) {
        setVaultSettings(vStatus);
        setCapAmountInput(String(vStatus.budget_cap_amount || 0));
        setCapCurrencyInput(vStatus.budget_cap_currency || baseCurrency);
      }
    } catch (err: any) {
      const msg = err?.message || 'Error al cargar los datos financieros.';
      setLoadError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [isUnlocked, baseCurrency, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData, dataVersion]);

  useEffect(() => {
    if (exchangeRate) {
      setManualRateInput(exchangeRate.rate.toString());
    }
  }, [exchangeRate]);

  useEffect(() => {
    if (!currencyOptions.includes(pipelineCurrencyView)) {
      setPipelineCurrencyView(baseCurrency);
    }
    if (!currencyOptions.includes(profitCurrencyView)) {
      setProfitCurrencyView(baseCurrency);
    }
  }, [baseCurrency, currencyOptions, pipelineCurrencyView, profitCurrencyView]);

  const handleSaveManualRate = async () => {
    const rateNum = parseFloat(manualRateInput);
    if (isNaN(rateNum) || rateNum <= 0) {
      showToast('Introduce un tipo de cambio mayor a 0.', 'error');
      return;
    }

    setIsSyncingRate(true);
    try {
      await api.setManualExchangeRate(rateNum, true);
      await refreshExchangeRate();
      triggerDataReload();
      setIsEditingRate(false);
      showToast(`Tipo de cambio manual guardado: 1 ${exchangePairBase} = $${rateNum.toFixed(2)} ${exchangePairTarget}`, 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsSyncingRate(false);
    }
  };

  const handleSaveBudgetCap = async () => {
    if (!isUnlocked) {
      openUnlockModal();
      return;
    }
    const val = parseFloat(capAmountInput);
    const cleanVal = isNaN(val) || val < 0 ? 0 : val;
    try {
      await api.updateSettings({
        budget_cap_amount: cleanVal,
        budget_cap_currency: capCurrencyInput
      });
      setIsEditingCap(false);
      showToast(
        cleanVal > 0
          ? `Tope de gasto mensual fijado en $${formatAmount(cleanVal)} ${capCurrencyInput}`
          : 'Tope de gasto mensual desactivado.',
        'success'
      );
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleSyncOfficialRate = async () => {
    if (isSyncingRate) return;
    setIsSyncingRate(true);
    try {
      const updated = await api.syncExchangeRate();
      await refreshExchangeRate();
      triggerDataReload();
      if (updated && updated.synced === false) {
        setIsEditingRate(true);
        showToast(
          updated.source === 'modo_local'
            ? 'Modo local activo. Puedes ajustar el valor manualmente.'
            : 'Sin conexión al servidor de divisas. Puedes ajustar el valor manualmente.',
          'warning'
        );
      } else {
        showToast(`Tipo de cambio actualizado: 1 ${exchangePairBase} = $${updated.rate.toFixed(2)} ${exchangePairTarget}`, 'success');
      }
    } catch {
      setIsEditingRate(true);
      showToast('No se pudo conectar al servidor de divisas. Puedes editar el valor manualmente.', 'warning');
    } finally {
      setIsSyncingRate(false);
    }
  };

  const handleDeletePaymentMethod = async (pay: PaymentMethod) => {
    if (!isUnlocked) {
      openUnlockModal();
      return;
    }
    const accepted = await confirm({
      title: 'Enviar tarjeta a papelera',
      message: `¿Enviar la tarjeta "${pay.alias} (*${pay.last_four})" a la papelera?`,
      confirmLabel: 'Enviar a papelera',
      cancelLabel: 'Cancelar',
      tone: 'danger',
    });
    if (!accepted) return;
    try {
      await api.deletePaymentMethod(pay.id);
      showToast(`Tarjeta "${pay.alias}" enviada a la papelera.`, 'info');
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Income Modal Handlers
  const openNewIncomeModal = () => {
    setEditingIncome(null);
    setIncClientName('');
    setIncProspectId('');
    setIncConcept('');
    setIncCategory('anticipo');
    setIncAmount('');
    setIncCurrency(baseCurrency);
    setIncStatus('cobrado');
    setIncDate(new Date().toISOString().split('T')[0]);
    setIncMethod('Transferencia SPEI');
    setIncRecurring(false);
    setIncScope(defaultEntityScope);
    setIncNotes('');
    setShowQuickClientInInc(false);
    setQuickClientNameInInc('');
    setIsIncomeModalOpen(true);
  };

  const openEditIncomeModal = (inc: ClientIncome) => {
    setEditingIncome(inc);
    setIncClientName(inc.client_name);
    setIncProspectId(inc.prospect_id || '');
    setIncConcept(inc.concept);
    setIncCategory(inc.category || 'anticipo');
    setIncAmount(String(inc.amount));
    setIncCurrency(inc.currency || baseCurrency);
    setIncStatus(inc.status || 'cobrado');
    setIncDate(inc.received_date || new Date().toISOString().split('T')[0]);
    setIncMethod(inc.payment_method_label || 'Transferencia SPEI');
    setIncRecurring(Boolean(inc.is_recurring));
    setIncScope(inc.scope || 'business');
    setIncNotes(inc.notes || '');
    setShowQuickClientInInc(false);
    setQuickClientNameInInc('');
    setIsIncomeModalOpen(true);
  };

  const handleQuickCreateClientInInc = async () => {
    if (!quickClientNameInInc.trim()) return;
    setCreatingQuickClientInInc(true);
    try {
      const created = await api.createProspect({
        company_name: quickClientNameInInc.trim(),
        contact_name: quickClientNameInInc.trim(),
        status: 'respondido',
        scope: incScope
      });
      setProspects((prev) => [created, ...prev]);
      setIncProspectId(created.id);
      setIncClientName(created.company_name);
      setShowQuickClientInInc(false);
      setQuickClientNameInInc('');
      showToast(`Cliente "${created.company_name}" creado e incorporado.`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Error al crear cliente rápido.', 'error');
    } finally {
      setCreatingQuickClientInInc(false);
    }
  };

  const handleSaveIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incClientName.trim() || !incConcept.trim()) {
      showToast('Completa el nombre del cliente y el concepto del pago.', 'warning');
      return;
    }
    const parsedAmount = parseFloat(incAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      showToast('Ingresa un monto válido mayor a 0.', 'warning');
      return;
    }

    setSavingIncome(true);
    try {
      const payload: Partial<ClientIncome> = {
        prospect_id: incProspectId || null,
        client_name: incClientName.trim(),
        concept: incConcept.trim(),
        category: incCategory,
        amount: parsedAmount,
        currency: incCurrency,
        status: incStatus,
        received_date: incDate,
        payment_method_label: incMethod.trim() || null,
        is_recurring: incRecurring || incCategory === 'iguala_mensual',
        scope: incScope,
        notes: incNotes.trim() || null,
      };
      if (editingIncome) {
        await api.updateIncome(editingIncome.id, payload);
        showToast('Pago actualizado correctamente.', 'success');
      } else {
        await api.createIncome(payload);
        showToast('Pago registrado correctamente.', 'success');
      }
      setIsIncomeModalOpen(false);
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message || 'Error al guardar el pago.', 'error');
    } finally {
      setSavingIncome(false);
    }
  };

  const handleCloneIncome = async (inc: ClientIncome) => {
    try {
      const cloned = await api.cloneIncomeNextMonth(inc.id);
      showToast(`Cobro recurrente clonado al siguiente periodo (+1 mes): "${cloned.concept}".`, 'success');
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message || 'Error al clonar cobro.', 'error');
    }
  };

  const handleToggleIncomeStatus = async (inc: ClientIncome) => {
    const nextStatus: IncomeStatus = inc.status === 'cobrado' ? 'pendiente' : 'cobrado';
    try {
      await api.updateIncome(inc.id, { status: nextStatus });
      showToast(
        nextStatus === 'cobrado'
          ? `Pago de "${inc.client_name}" marcado como cobrado.`
          : `Pago de "${inc.client_name}" marcado como pendiente.`,
        'success'
      );
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteIncome = async (inc: ClientIncome) => {
    const accepted = await confirm({
      title: 'Enviar pago a papelera',
      message: `¿Enviar el registro de pago "${inc.client_name} - ${inc.concept}" a la papelera?`,
      confirmLabel: 'Enviar a papelera',
      cancelLabel: 'Cancelar',
      tone: 'danger',
    });
    if (!accepted) return;
    try {
      await api.deleteIncome(inc.id);
      showToast('Registro de pago enviado a la papelera.', 'info');
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Renewal Modal Handlers
  const openNewRenewalModal = () => {
    setEditingRenewal(null);
    setRenClientName('');
    setRenProspectId('');
    setRenPlatformId('');
    setRenDomainOrService('');
    setRenServiceType('dominio');
    setRenProvider('');
    const nextYr = new Date();
    nextYr.setFullYear(nextYr.getFullYear() + 1);
    setRenDate(nextYr.toISOString().split('T')[0]);
    setRenCost('');
    setRenCurrency(baseCurrency);
    setRenCycle('yearly');
    setRenPaidBy('client');
    setRenClientCharge('');
    setRenScope(defaultEntityScope);
    setRenAutoRenew(false);
    setRenNotes('');
    setShowQuickClientInRen(false);
    setQuickClientNameInRen('');
    setIsRenewalModalOpen(true);
  };

  const openEditRenewalModal = (ren: DomainRenewal) => {
    setEditingRenewal(ren);
    setRenClientName(ren.client_name);
    setRenProspectId(ren.prospect_id || '');
    setRenPlatformId(ren.platform_id || '');
    setRenDomainOrService(ren.domain_or_service);
    setRenServiceType(ren.service_type || 'dominio');
    setRenProvider(ren.provider || '');
    setRenDate(ren.renewal_date);
    setRenCost(String(ren.renewal_cost));
    setRenCurrency(ren.currency || baseCurrency);
    setRenCycle(ren.billing_cycle || 'yearly');
    setRenPaidBy(ren.paid_by || 'client');
    setRenClientCharge(ren.client_charge_amount ? String(ren.client_charge_amount) : '');
    setRenScope(ren.scope || 'business');
    setRenAutoRenew(Boolean(ren.auto_renew));
    setRenNotes(ren.notes || '');
    setShowQuickClientInRen(false);
    setQuickClientNameInRen('');
    setIsRenewalModalOpen(true);
  };

  const handleQuickCreateClientInRen = async () => {
    if (!quickClientNameInRen.trim()) return;
    setCreatingQuickClientInRen(true);
    try {
      const created = await api.createProspect({
        company_name: quickClientNameInRen.trim(),
        contact_name: quickClientNameInRen.trim(),
        status: 'respondido',
        scope: renScope
      });
      setProspects((prev) => [created, ...prev]);
      setRenProspectId(created.id);
      setRenClientName(created.company_name);
      setShowQuickClientInRen(false);
      setQuickClientNameInRen('');
      showToast(`Cliente "${created.company_name}" creado e incorporado.`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Error al crear cliente rápido.', 'error');
    } finally {
      setCreatingQuickClientInRen(false);
    }
  };

  const handleSaveRenewal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renClientName.trim() || !renDomainOrService.trim()) {
      showToast('Completa el nombre del cliente y el dominio o servicio.', 'warning');
      return;
    }
    const parsedCost = parseFloat(renCost || '0');
    if (isNaN(parsedCost) || parsedCost < 0) {
      showToast('Ingresa un costo de renovación válido.', 'warning');
      return;
    }

    const parsedCharge = renClientCharge ? parseFloat(renClientCharge) : null;

    setSavingRenewal(true);
    try {
      const payload: Partial<DomainRenewal> = {
        prospect_id: renProspectId || null,
        platform_id: renPlatformId || null,
        client_name: renClientName.trim(),
        domain_or_service: renDomainOrService.trim(),
        service_type: renServiceType,
        provider: renProvider.trim() || null,
        renewal_date: renDate,
        renewal_cost: parsedCost,
        currency: renCurrency,
        billing_cycle: renCycle,
        paid_by: renPaidBy,
        client_charge_amount: parsedCharge && !isNaN(parsedCharge) ? parsedCharge : undefined,
        scope: renScope,
        status: 'activo',
        auto_renew: renAutoRenew,
        notes: renNotes.trim() || null,
      };
      if (editingRenewal) {
        await api.updateRenewal(editingRenewal.id, payload);
        showToast('Vencimiento actualizado correctamente.', 'success');
      } else {
        await api.createRenewal(payload);
        showToast('Vencimiento de dominio/hosting registrado.', 'success');
      }
      setIsRenewalModalOpen(false);
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message || 'Error al guardar el vencimiento.', 'error');
    } finally {
      setSavingRenewal(false);
    }
  };

  const handleOpenAdvanceRenewalModal = (ren: DomainRenewal) => {
    setAdvanceRenewalTarget(ren);
    const suggestedCharge = ren.client_charge_amount && ren.client_charge_amount > 0
      ? ren.client_charge_amount
      : ren.paid_by === 'client' ? ren.renewal_cost : 0;
    setAdvanceChargedAmount(suggestedCharge > 0 ? String(suggestedCharge) : '');
    setAdvanceCreateIncome(ren.paid_by === 'client' || (ren.client_charge_amount || 0) > 0);
  };

  const handleConfirmAdvanceRenewal = async () => {
    if (!advanceRenewalTarget) return;
    setAdvancingRenewal(true);
    try {
      const chargeNum = parseFloat(advanceChargedAmount || '0');
      const payload: AdvanceRenewalPayload = {
        create_income: advanceCreateIncome,
        charged_amount: !isNaN(chargeNum) && chargeNum > 0 ? chargeNum : undefined,
      };
      const updated = await api.advanceRenewalCycle(advanceRenewalTarget.id, payload);
      const profitDelta = advanceCreateIncome && !isNaN(chargeNum) && chargeNum > 0
        ? chargeNum - (advanceRenewalTarget.renewal_cost || 0)
        : 0;
      const msg = advanceCreateIncome && !isNaN(chargeNum) && chargeNum > 0
        ? `Renovado con éxito. Se avanzó la fecha a ${updated.renewal_date} y se registró el cobro de $${formatAmount(chargeNum)} ${updated.currency} en Ingresos (Margen: $${formatAmount(profitDelta)}).`
        : `Renovado con éxito por un ciclo más. Nuevo vencimiento: ${updated.renewal_date}`;
      showToast(msg, 'success');
      setAdvanceRenewalTarget(null);
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message || 'Error al renovar ciclo.', 'error');
    } finally {
      setAdvancingRenewal(false);
    }
  };

  const handleDeleteRenewal = async (ren: DomainRenewal) => {
    const accepted = await confirm({
      title: 'Enviar vencimiento a papelera',
      message: `¿Enviar el vencimiento de "${ren.domain_or_service}" a la papelera?`,
      confirmLabel: 'Enviar a papelera',
      cancelLabel: 'Cancelar',
      tone: 'danger',
    });
    if (!accepted) return;
    try {
      await api.deleteRenewal(ren.id);
      showToast('Registro de vencimiento enviado a la papelera.', 'info');
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // One-Time Expense Handlers
  const openNewExpenseModal = () => {
    setEditingExpense(null);
    setExpTitle('');
    setExpCategory(EXPENSE_CATEGORIES[0]);
    setExpAmount('');
    setExpCurrency(baseCurrency);
    setExpDate(new Date().toISOString().split('T')[0]);
    setExpScope(defaultEntityScope);
    setExpPaymentMethodId('');
    setExpPaymentMethodLabel('');
    setExpNotes('');
    setIsExpenseModalOpen(true);
  };

  const openEditExpenseModal = (exp: OneTimeExpense) => {
    setEditingExpense(exp);
    setExpTitle(exp.concept);
    setExpCategory(exp.category);
    setExpAmount(String(exp.amount));
    setExpCurrency(exp.currency || baseCurrency);
    setExpDate(exp.expense_date);
    setExpScope(exp.scope || 'business');
    setExpPaymentMethodId('');
    setExpPaymentMethodLabel(exp.payment_method_label || '');
    setExpNotes(exp.notes || '');
    setIsExpenseModalOpen(true);
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expTitle.trim()) {
      showToast('Escribe el título o descripción del gasto.', 'warning');
      return;
    }
    const val = parseFloat(expAmount);
    if (isNaN(val) || val <= 0) {
      showToast('Ingresa un monto válido mayor a 0.', 'warning');
      return;
    }
    setSavingExpense(true);
    try {
      const payload: Partial<OneTimeExpense> = {
        concept: expTitle.trim(),
        category: expCategory.trim(),
        amount: val,
        currency: expCurrency,
        expense_date: expDate,
        scope: expScope,
        payment_method_label: expPaymentMethodLabel.trim() || null,
        notes: expNotes.trim() || null,
      };
      if (editingExpense) {
        await api.updateExpense(editingExpense.id, payload);
        showToast('Gasto único actualizado.', 'success');
      } else {
        await api.createExpense(payload);
        showToast('Gasto único registrado.', 'success');
      }
      setIsExpenseModalOpen(false);
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message || 'Error al guardar gasto único.', 'error');
    } finally {
      setSavingExpense(false);
    }
  };

  const handleDeleteExpense = async (exp: OneTimeExpense) => {
    const accepted = await confirm({
      title: 'Enviar gasto único a papelera',
      message: `¿Enviar el gasto único "${exp.concept}" a la papelera?`,
      confirmLabel: 'Enviar a papelera',
      cancelLabel: 'Cancelar',
      tone: 'danger',
    });
    if (!accepted) return;
    try {
      await api.deleteExpense(exp.id);
      showToast('Gasto único enviado a la papelera.', 'info');
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const fin = useMemo(
    () => computeFinancialExecutiveSummary(platforms, paymentMethods, exchangeRate?.rate, activeScope, expenses),
    [platforms, paymentMethods, exchangeRate?.rate, activeScope, expenses]
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
        vaultSettings?.budget_cap_currency || baseCurrency,
        fin.usdRate
      ),
    [fin, vaultSettings, baseCurrency]
  );

  const pipelineSummary = useMemo(
    () => computeCommercialPipelineSummary(prospects, fin.usdRate, fin.monthlyMXN),
    [prospects, fin.usdRate, fin.monthlyMXN]
  );

  const activeOrTrialPlatforms = useMemo(
    () =>
      platforms
        .filter((p) => matchesScope(p.scope) && (p.subscription_status === 'active' || p.subscription_status === 'free_trial' || p.subscription_cost > 0))
        .sort((a, b) => (a.next_billing_date || '9999').localeCompare(b.next_billing_date || '9999')),
    [platforms, matchesScope]
  );

  const filteredIncomes = useMemo(() => incomes.filter((i) => matchesScope(i.scope)), [incomes, matchesScope]);
  const filteredRenewals = useMemo(() => renewals.filter((r) => matchesScope(r.scope)), [renewals, matchesScope]);
  const filteredExpenses = useMemo(() => expenses.filter((e) => matchesScope(e.scope)), [expenses, matchesScope]);
  const filteredPaymentMethods = useMemo(() => paymentMethods.filter((p) => matchesScope(p.scope)), [paymentMethods, matchesScope]);

  if (!isUnlocked) {
    return (
      <div className="mx-auto max-w-xl space-y-4 p-4 pt-12 text-center animate-fadeIn sm:p-8 sm:pt-24">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-amber-500/20 bg-amber-500/10 text-amber-400">
          <Lock size={32} aria-hidden="true" />
        </div>
        <div className="flex items-center justify-center gap-2">
          <h2 className="text-xl font-bold tracking-tight text-white">Finanzas Protegidas</h2>
          <InfoTooltip
            title="Protección con contraseña de acceso"
            content="Desbloquea con tu contraseña de acceso para consultar ingresos, tarjetas, gastos y renovaciones."
          />
        </div>
        <button
          type="button"
          onClick={openUnlockModal}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500"
        >
          <span>Desbloquear con contraseña de acceso</span>
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        role="status"
        aria-label="Cargando finanzas"
        className="mx-auto max-w-7xl min-w-0 space-y-5 p-3 sm:space-y-7 sm:p-8 animate-fadeIn"
      >
        <div className="h-12 w-full rounded-2xl border border-obsidian-border bg-obsidian-panel animate-pulse" />
        <div className="h-72 w-full rounded-2xl border border-obsidian-border bg-obsidian-panel animate-pulse" />
        <div className="h-52 w-full rounded-2xl border border-obsidian-border bg-obsidian-panel animate-pulse" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl p-4 sm:p-8 animate-fadeIn">
        <EmptyState
          tone="error"
          icon={AlertTriangle}
          title="No se pudieron cargar tus finanzas"
          description={loadError}
          actionLabel="Reintentar"
          onAction={loadData}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl min-w-0 space-y-5 p-3 sm:space-y-7 sm:p-8 animate-fadeIn">
      {(!exchangeRate || !exchangeRate.is_manual) && (
        <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          Verifica el tipo de cambio antes de usar los totales convertidos: el valor disponible puede ser una referencia o estar desactualizado.
        </p>
      )}

      {/* Header and Exchange Rate Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <CreditCard className="text-indigo-400 flex-shrink-0" size={18} aria-hidden="true" />
          <h2 className="text-base font-bold text-white tracking-tight truncate">
            Finanzas, Ingresos de Clientes y Vencimientos
          </h2>
          <InfoTooltip
            title="Control Financiero Completo"
            content="Revisa cuánto gastas en suscripciones, cuánto dinero real te han pagado tus clientes (ganancia neta) y cuándo vencen los dominios y hostings de tus proyectos."
          />
        </div>

        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
          {/* Compact Exchange Rate Control */}
          <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2 rounded-xl border border-obsidian-border bg-obsidian-panel px-3 py-1.5">
            <DollarSign size={14} className="text-emerald-400 flex-shrink-0" aria-hidden="true" />
            {isEditingRate ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  inputMode="decimal"
                  maxLength={10}
                  aria-label="Tipo de cambio manual"
                  value={manualRateInput}
                  onChange={(e) => setManualRateInput(e.target.value.replace(/[^0-9.]/g, ''))}
                  className="w-20 px-2 py-0.5 rounded-lg bg-obsidian-bg border border-indigo-500 text-xs font-mono text-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleSaveManualRate}
                  className="px-2 py-0.5 rounded-lg bg-indigo-600 text-white text-[11px] font-semibold hover:bg-indigo-500"
                >
                  OK
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingRate(false)}
                  aria-label="Cancelar edición de tipo de cambio"
                  className="px-2 py-0.5 rounded-lg bg-obsidian-surface text-obsidian-muted text-[11px] hover:text-white"
                >
                  X
                </button>
              </div>
            ) : (
              <>
                <span className="font-mono text-xs text-white font-bold whitespace-nowrap">
                  1 {exchangePairBase} = ${fin.usdRate.toFixed(2)} {exchangePairTarget}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${
                    exchangeRate?.is_manual
                      ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  }`}
                >
                  {exchangeRate?.is_manual ? 'Manual' : 'Actualizado'}
                </span>
                <button
                  type="button"
                  onClick={() => setIsEditingRate(true)}
                  title="Editar tipo de cambio manualmente"
                  aria-label="Editar tipo de cambio manualmente"
                  className="p-1 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface transition-colors"
                >
                  <Edit2 size={12} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={handleSyncOfficialRate}
                  disabled={isSyncingRate}
                  title="Actualizar tipo de cambio desde internet"
                  aria-label="Actualizar tipo de cambio desde internet"
                  className="p-1 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={12} className={isSyncingRate ? 'animate-spin text-indigo-400' : ''} aria-hidden="true" />
                </button>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={openNewIncomeModal}
            className="inline-flex max-w-full items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-left text-xs font-semibold text-white shadow-md shadow-emerald-600/20 transition-all hover:bg-emerald-500"
          >
            <Plus size={14} aria-hidden="true" />
            <span>Registrar Pago Recibido</span>
          </button>

          <button
            type="button"
            onClick={openNewRenewalModal}
            className="inline-flex max-w-full items-center gap-1.5 rounded-xl border border-obsidian-border bg-obsidian-surface px-3 py-2 text-left text-xs font-semibold text-white transition-all hover:bg-obsidian-border"
          >
            <Globe size={14} className="text-cyan-400" aria-hidden="true" />
            <span>Nuevo Dominio / Hosting</span>
          </button>

          <button
            type="button"
            onClick={openNewExpenseModal}
            className="inline-flex max-w-full items-center gap-1.5 rounded-xl border border-purple-500/30 bg-purple-600/20 px-3 py-2 text-left text-xs font-semibold text-purple-200 transition-all hover:bg-purple-600/30"
          >
            <Receipt size={14} className="text-purple-300" aria-hidden="true" />
            <span>Nuevo Gasto Único</span>
          </button>

          <button
            type="button"
            onClick={() => openPaymentModal()}
            className="inline-flex max-w-full items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-left text-xs font-semibold text-white shadow-md shadow-indigo-600/20 transition-all hover:bg-indigo-500"
          >
            <Plus size={14} aria-hidden="true" />
            <span>Nueva Tarjeta</span>
          </button>
        </div>
      </div>

      <FinancialExecutiveSummary
        fin={fin}
        realProfit={realProfit}
        budgetCapEval={budgetCapEval}
        pipelineSummary={pipelineSummary}
        profitCurrencyView={profitCurrencyView}
        setProfitCurrencyView={setProfitCurrencyView}
        pipelineCurrencyView={pipelineCurrencyView}
        setPipelineCurrencyView={setPipelineCurrencyView}
        currencyOptions={currencyOptions}
        baseCurrency={baseCurrency}
        secondaryCurrency={secondaryCurrency}
        supportedCurrencies={supportedCurrencies}
        formatAmount={formatAmount}
        isEditingCap={isEditingCap}
        setIsEditingCap={setIsEditingCap}
        capAmountInput={capAmountInput}
        setCapAmountInput={setCapAmountInput}
        capCurrencyInput={capCurrencyInput}
        setCapCurrencyInput={setCapCurrencyInput}
        handleSaveBudgetCap={handleSaveBudgetCap}
        isUnlocked={isUnlocked}
        openUnlockModal={openUnlockModal}
        openInspector={openInspector}
        setActiveSection={setActiveSection}
      />

      <SubscriptionsLists
        filteredIncomes={filteredIncomes}
        filteredRenewals={filteredRenewals}
        filteredExpenses={filteredExpenses}
        filteredPaymentMethods={filteredPaymentMethods}
        platforms={platforms}
        activeOrTrialPlatforms={activeOrTrialPlatforms}
        billingHistory={billingHistory}
        realProfit={realProfit}
        profitCurrencyView={profitCurrencyView}
        baseCurrency={baseCurrency}
        formatAmount={formatAmount}
        isUnlocked={isUnlocked}
        openUnlockModal={openUnlockModal}
        openPaymentModal={openPaymentModal}
        openInspector={openInspector}
        setActiveSection={setActiveSection}
        openNewIncomeModal={openNewIncomeModal}
        openEditIncomeModal={openEditIncomeModal}
        handleToggleIncomeStatus={handleToggleIncomeStatus}
        handleCloneIncome={handleCloneIncome}
        handleDeleteIncome={handleDeleteIncome}
        openNewRenewalModal={openNewRenewalModal}
        openEditRenewalModal={openEditRenewalModal}
        handleOpenAdvanceRenewalModal={handleOpenAdvanceRenewalModal}
        handleDeleteRenewal={handleDeleteRenewal}
        openNewExpenseModal={openNewExpenseModal}
        openEditExpenseModal={openEditExpenseModal}
        handleDeleteExpense={handleDeleteExpense}
        handleDeletePaymentMethod={handleDeletePaymentMethod}
      />

      <SubscriptionsModals
        supportedCurrencies={supportedCurrencies}
        prospects={prospects}
        paymentMethods={paymentMethods}
        formatAmount={formatAmount}
        isIncomeModalOpen={isIncomeModalOpen}
        setIsIncomeModalOpen={setIsIncomeModalOpen}
        editingIncome={editingIncome}
        incClientName={incClientName}
        setIncClientName={setIncClientName}
        incProspectId={incProspectId}
        setIncProspectId={setIncProspectId}
        incConcept={incConcept}
        setIncConcept={setIncConcept}
        incCategory={incCategory}
        setIncCategory={setIncCategory}
        incAmount={incAmount}
        setIncAmount={setIncAmount}
        incCurrency={incCurrency}
        setIncCurrency={setIncCurrency}
        incStatus={incStatus}
        setIncStatus={setIncStatus}
        incDate={incDate}
        setIncDate={setIncDate}
        incMethod={incMethod}
        setIncMethod={setIncMethod}
        incRecurring={incRecurring}
        setIncRecurring={setIncRecurring}
        incScope={incScope}
        setIncScope={setIncScope}
        incNotes={incNotes}
        setIncNotes={setIncNotes}
        savingIncome={savingIncome}
        showQuickClientInInc={showQuickClientInInc}
        setShowQuickClientInInc={setShowQuickClientInInc}
        quickClientNameInInc={quickClientNameInInc}
        setQuickClientNameInInc={setQuickClientNameInInc}
        creatingQuickClientInInc={creatingQuickClientInInc}
        handleQuickCreateClientInInc={handleQuickCreateClientInInc}
        handleSaveIncome={handleSaveIncome}
        isRenewalModalOpen={isRenewalModalOpen}
        setIsRenewalModalOpen={setIsRenewalModalOpen}
        editingRenewal={editingRenewal}
        renClientName={renClientName}
        setRenClientName={setRenClientName}
        renProspectId={renProspectId}
        setRenProspectId={setRenProspectId}
        renDomainOrService={renDomainOrService}
        setRenDomainOrService={setRenDomainOrService}
        renServiceType={renServiceType}
        setRenServiceType={setRenServiceType}
        renProvider={renProvider}
        setRenProvider={setRenProvider}
        renDate={renDate}
        setRenDate={setRenDate}
        renCost={renCost}
        setRenCost={setRenCost}
        renCurrency={renCurrency}
        setRenCurrency={setRenCurrency}
        renCycle={renCycle}
        setRenCycle={setRenCycle}
        renPaidBy={renPaidBy}
        setRenPaidBy={setRenPaidBy}
        renClientCharge={renClientCharge}
        setRenClientCharge={setRenClientCharge}
        renScope={renScope}
        setRenScope={setRenScope}
        renNotes={renNotes}
        setRenNotes={setRenNotes}
        savingRenewal={savingRenewal}
        showQuickClientInRen={showQuickClientInRen}
        setShowQuickClientInRen={setShowQuickClientInRen}
        quickClientNameInRen={quickClientNameInRen}
        setQuickClientNameInRen={setQuickClientNameInRen}
        creatingQuickClientInRen={creatingQuickClientInRen}
        handleQuickCreateClientInRen={handleQuickCreateClientInRen}
        handleSaveRenewal={handleSaveRenewal}
        advanceRenewalTarget={advanceRenewalTarget}
        setAdvanceRenewalTarget={setAdvanceRenewalTarget}
        advanceCreateIncome={advanceCreateIncome}
        setAdvanceCreateIncome={setAdvanceCreateIncome}
        advanceChargedAmount={advanceChargedAmount}
        setAdvanceChargedAmount={setAdvanceChargedAmount}
        advancingRenewal={advancingRenewal}
        handleConfirmAdvanceRenewal={handleConfirmAdvanceRenewal}
        isExpenseModalOpen={isExpenseModalOpen}
        setIsExpenseModalOpen={setIsExpenseModalOpen}
        editingExpense={editingExpense}
        expTitle={expTitle}
        setExpTitle={setExpTitle}
        expCategory={expCategory}
        setExpCategory={setExpCategory}
        expAmount={expAmount}
        setExpAmount={setExpAmount}
        expCurrency={expCurrency}
        setExpCurrency={setExpCurrency}
        expDate={expDate}
        setExpDate={setExpDate}
        expScope={expScope}
        setExpScope={setExpScope}
        expPaymentMethodId={expPaymentMethodId}
        setExpPaymentMethodId={setExpPaymentMethodId}
        expPaymentMethodLabel={expPaymentMethodLabel}
        setExpPaymentMethodLabel={setExpPaymentMethodLabel}
        expNotes={expNotes}
        setExpNotes={setExpNotes}
        savingExpense={savingExpense}
        handleSaveExpense={handleSaveExpense}
      />
    </div>
  );
};
