import React, { useState, useEffect, useMemo } from 'react';
import { 
  CreditCard, Plus, DollarSign, Calendar, RefreshCw, 
  Edit2, Edit3, Trash2, TrendingUp, TrendingDown, BarChart3,
  Layers, PiggyBank, AlertTriangle, Mail, Activity, Briefcase,
  Target, History, CheckCircle2, Wallet, Globe, Server, Check, X, Clock,
  Receipt, ShoppingBag, Repeat, Tag, ShieldCheck, ArrowRight
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { 
  PaymentMethod, PlatformAccount, Prospect, BillingRecord, VaultStatus,
  ClientIncome, DomainRenewal, IncomeCategory, IncomeStatus, RenewalServiceType, RenewalPaidBy,
  OneTimeExpense, EntityScope, AdvanceRenewalPayload
} from '../../types';
import { PlatformIcon } from '../common/PlatformIcon';
import { SecretField } from '../common/SecretField';
import { InfoTooltip } from '../common/InfoTooltip';
import { 
  computeFinancialExecutiveSummary, evaluateBudgetCap, formatMoney,
  computeRealProfitAndRenewalsSummary
} from '../../lib/financeUtils';
import { computeCommercialPipelineSummary } from '../../lib/prospectUtils';
import { INPUT_LIMITS } from '../../lib/validation';

const INCOME_CATEGORIES: { value: IncomeCategory; label: string; badge: string }[] = [
  { value: 'anticipo', label: 'Anticipo de Proyecto', badge: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' },
  { value: 'liquidacion', label: 'Liquidación de Página Web', badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  { value: 'iguala_mensual', label: 'Iguala Mensual / Mantenimiento', badge: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
  { value: 'dominio_hosting', label: 'Cobro de Dominio / Hosting', badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  { value: 'otro', label: 'Otro Ingreso', badge: 'bg-obsidian-surface text-obsidian-text border-obsidian-border' },
];

const RENEWAL_SERVICE_TYPES: { value: RenewalServiceType; label: string }[] = [
  { value: 'dominio', label: 'Dominio Web' },
  { value: 'hosting', label: 'Hosting / Alojamiento' },
  { value: 'dominio_y_hosting', label: 'Dominio + Hosting' },
  { value: 'ssl_otro', label: 'Certificado SSL / Otro' },
];

const EXPENSE_CATEGORIES = [
  'Hardware / Equipos',
  'Licencias Vitalicias',
  'Servicios y Honorarios',
  'Mobiliario y Oficina',
  'Cursos y Capacitación',
  'Insumos / Consumibles',
  'Otro Gasto'
];

export const SubscriptionsView: React.FC = () => {
  const { 
    isUnlocked, openUnlockModal, openPaymentModal, 
    openInspector, exchangeRate, refreshExchangeRate, 
    showToast, triggerDataReload, dataVersion, setActiveSection,
    activeScope, matchesScope, defaultEntityScope
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

  // Budget Cap inline editing state
  const [isEditingCap, setIsEditingCap] = useState(false);
  const [capAmountInput, setCapAmountInput] = useState<string>('');
  const [capCurrencyInput, setCapCurrencyInput] = useState<'MXN' | 'USD'>('MXN');
  const [pipelineCurrencyView, setPipelineCurrencyView] = useState<'MXN' | 'USD'>('MXN');
  const [profitCurrencyView, setProfitCurrencyView] = useState<'MXN' | 'USD'>('MXN');

  // Income Modal State
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
  const [editingIncome, setEditingIncome] = useState<ClientIncome | null>(null);
  const [incClientName, setIncClientName] = useState('');
  const [incProspectId, setIncProspectId] = useState('');
  const [incConcept, setIncConcept] = useState('');
  const [incCategory, setIncCategory] = useState<IncomeCategory>('anticipo');
  const [incAmount, setIncAmount] = useState('');
  const [incCurrency, setIncCurrency] = useState<'MXN' | 'USD'>('MXN');
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
  const [renCurrency, setRenCurrency] = useState<'MXN' | 'USD'>('MXN');
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
  const [expCurrency, setExpCurrency] = useState<'MXN' | 'USD'>('MXN');
  const [expDate, setExpDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [expScope, setExpScope] = useState<EntityScope>('business');
  const [expPaymentMethodId, setExpPaymentMethodId] = useState('');
  const [expPaymentMethodLabel, setExpPaymentMethodLabel] = useState('');
  const [expNotes, setExpNotes] = useState('');
  const [savingExpense, setSavingExpense] = useState(false);

  const [, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getPaymentMethods(),
      api.getPlatforms(),
      api.getProspects(),
      api.getIncomes().catch(() => [] as ClientIncome[]),
      api.getRenewals().catch(() => [] as DomainRenewal[]),
      api.getExpenses().catch(() => [] as OneTimeExpense[]),
      api.getBillingHistory(12).catch(() => [] as BillingRecord[]),
      api.getVaultStatus().catch(() => null)
    ]).then(([payList, platList, prospList, incList, renList, expList, billHist, vStatus]) => {
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
        setCapCurrencyInput((vStatus.budget_cap_currency === 'USD' ? 'USD' : 'MXN'));
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, [isUnlocked, dataVersion]);

  useEffect(() => {
    if (exchangeRate) {
      setManualRateInput(exchangeRate.rate.toString());
    }
  }, [exchangeRate]);

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
      showToast(`Tipo de cambio manual guardado: 1 USD = $${rateNum.toFixed(2)} MXN`, 'success');
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
          ? `Tope de gasto mensual fijado en $${formatMoney(cleanVal)} ${capCurrencyInput}`
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
        showToast(updated.source === 'modo_local' ? 'Modo local activo. Puedes ajustar el valor manualmente.' : 'Sin conexión al servidor de divisas. Puedes ajustar el valor manualmente.', 'warning');
      } else {
        showToast(`Tipo de cambio actualizado: 1 USD = $${updated.rate.toFixed(2)} MXN`, 'success');
      }
    } catch (err: any) {
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
    if (!window.confirm(`¿Enviar la tarjeta "${pay.alias} (*${pay.last_four})" a la papelera?`)) return;
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
    setIncCurrency('MXN');
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
    setIncCurrency(inc.currency || 'MXN');
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
    if (!window.confirm(`¿Enviar el registro de pago "${inc.client_name} - ${inc.concept}" a la papelera?`)) return;
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
    setRenCurrency('MXN');
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
    setRenCurrency(ren.currency || 'MXN');
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
        ? `Renovado con éxito. Se avanzó la fecha a ${updated.renewal_date} y se registró el cobro de $${formatMoney(chargeNum)} ${updated.currency} en Ingresos (Margen: $${formatMoney(profitDelta)}).`
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
    if (!window.confirm(`¿Enviar el vencimiento de "${ren.domain_or_service}" a la papelera?`)) return;
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
    setExpCurrency('MXN');
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
    setExpCurrency(exp.currency);
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
    if (!window.confirm(`¿Enviar el gasto único "${exp.concept}" a la papelera?`)) return;
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
        vaultSettings?.budget_cap_currency || 'MXN',
        fin.usdRate
      ),
    [fin, vaultSettings]
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

  const filteredIncomes = useMemo(() => incomes.filter(i => matchesScope(i.scope)), [incomes, matchesScope]);
  const filteredRenewals = useMemo(() => renewals.filter(r => matchesScope(r.scope)), [renewals, matchesScope]);
  const filteredExpenses = useMemo(() => expenses.filter(e => matchesScope(e.scope)), [expenses, matchesScope]);
  const filteredPaymentMethods = useMemo(() => paymentMethods.filter(p => matchesScope(p.scope)), [paymentMethods, matchesScope]);


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
          <CreditCard className="text-indigo-400 flex-shrink-0" size={18} />
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
            <DollarSign size={14} className="text-emerald-400 flex-shrink-0" />
            {isEditingRate ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  inputMode="decimal"
                  maxLength={INPUT_LIMITS.EXCHANGE_RATE}
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
                  className="px-2 py-0.5 rounded-lg bg-obsidian-surface text-obsidian-muted text-[11px] hover:text-white"
                >
                  X
                </button>
              </div>
            ) : (
              <>
                <span className="font-mono text-xs text-white font-bold whitespace-nowrap">
                  1 USD = ${fin.usdRate.toFixed(2)} MXN
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
                  className="p-1 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface transition-colors"
                >
                  <Edit2 size={12} />
                </button>
                <button
                  type="button"
                  onClick={handleSyncOfficialRate}
                  disabled={isSyncingRate}
                  title="Actualizar tipo de cambio desde internet"
                  className="p-1 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={12} className={isSyncingRate ? 'animate-spin text-indigo-400' : ''} />
                </button>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={openNewIncomeModal}
            className="inline-flex max-w-full items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-left text-xs font-semibold text-white shadow-md shadow-emerald-600/20 transition-all hover:bg-emerald-500"
          >
            <Plus size={14} />
            <span>Registrar Pago Recibido</span>
          </button>

          <button
            type="button"
            onClick={openNewRenewalModal}
            className="inline-flex max-w-full items-center gap-1.5 rounded-xl border border-obsidian-border bg-obsidian-surface px-3 py-2 text-left text-xs font-semibold text-white transition-all hover:bg-obsidian-border"
          >
            <Globe size={14} className="text-cyan-400" />
            <span>Nuevo Dominio / Hosting</span>
          </button>

          <button
            type="button"
            onClick={openNewExpenseModal}
            className="inline-flex max-w-full items-center gap-1.5 rounded-xl border border-purple-500/30 bg-purple-600/20 px-3 py-2 text-left text-xs font-semibold text-purple-200 transition-all hover:bg-purple-600/30"
          >
            <Receipt size={14} className="text-purple-300" />
            <span>Nuevo Gasto Único</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (!isUnlocked) openUnlockModal();
              else openPaymentModal();
            }}
            className="inline-flex max-w-full items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-left text-xs font-semibold text-white shadow-md shadow-indigo-600/20 transition-all hover:bg-indigo-500"
          >
            <Plus size={14} />
            <span>Nueva Tarjeta</span>
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* RESUMEN EJECUTIVO: GASTOS, INGRESOS REALES Y GANANCIA NETA            */}
      {/* ===================================================================== */}
      <div className="min-w-0 rounded-2xl border border-obsidian-border bg-obsidian-panel p-3 shadow-xl sm:p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-obsidian-border/70">
          <div className="flex items-center gap-2 min-w-0">
            <BarChart3 size={16} className="text-indigo-400 flex-shrink-0" />
            <h3 className="text-sm font-bold text-white tracking-tight truncate">
              Resumen de Gastos, Ingresos y Ganancia Neta Real
            </h3>
            <InfoTooltip
              title="Cómo se calcula este resumen"
              content="Cruza lo que realmente ya te pagaron tus clientes contra tus gastos de suscripciones y dominios/hosting propios para mostrarte tu ganancia libre real por semana, mes y año."
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-obsidian-muted">
            <span>Suscripciones activas: <strong className="text-emerald-400">{fin.activeCount}</strong></span>
            <span>•</span>
            <span>En prueba gratis: <strong className="text-amber-300">{fin.freeTrialCount}</strong></span>
            <span>•</span>
            <span>Pausadas/Canceladas: <strong className="text-white/70">{fin.pausedOrCancelledCount}</strong></span>
          </div>
        </div>

        {/* GANANCIA NETA REAL (INGRESOS COBRADOS VS GASTOS) */}
        <div className="p-4 rounded-xl bg-obsidian-bg/80 border border-emerald-500/25 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Wallet size={15} className="text-emerald-400 shrink-0" />
              <span className="text-xs font-bold text-white truncate">
                Balance de Ganancia Neta Real (Pagos Cobrados menos Gastos)
              </span>
              <InfoTooltip content="Resta tus gastos de suscripciones (más dominios/hosting que pagas por tu cuenta) a los pagos ya cobrados de tus clientes en los últimos 7 días, este mes y este año." />
            </div>
            <div className="flex items-center p-0.5 rounded-lg bg-obsidian-surface border border-obsidian-border text-[10px] font-mono shrink-0">
              {(['MXN', 'USD'] as const).map((curr) => (
                <button
                  key={curr}
                  type="button"
                  onClick={() => setProfitCurrencyView(curr)}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    profitCurrencyView === curr
                      ? 'bg-emerald-600 text-white font-semibold'
                      : 'text-obsidian-muted hover:text-white'
                  }`}
                >
                  {curr}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Ganancia Neta Semanal */}
            <div className="p-3 rounded-xl bg-obsidian-surface/60 border border-obsidian-border min-w-0 space-y-1">
              <div className="flex items-center justify-between gap-1 text-[10px] text-obsidian-muted uppercase font-semibold">
                <span className="truncate">Ganancia Neta (Semana)</span>
                <span className="font-mono text-white/50">7 días</span>
              </div>
              <div className={`text-base font-bold font-mono truncate ${realProfit.netWeekMXN >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {realProfit.netWeekMXN >= 0 ? '+' : '-'}$
                {formatMoney(Math.abs(profitCurrencyView === 'MXN' ? realProfit.netWeekMXN : realProfit.netWeekUSD))} {profitCurrencyView}
              </div>
              <div className="text-[11px] font-mono text-obsidian-muted truncate">
                Cobrado: ${formatMoney(profitCurrencyView === 'MXN' ? realProfit.weekIncomeMXN : realProfit.weekIncomeUSD)} • Gasto: ${formatMoney(profitCurrencyView === 'MXN' ? realProfit.totalWeeklyExpenseMXN : realProfit.totalWeeklyExpenseUSD)}
              </div>
            </div>

            {/* Ganancia Neta Mensual */}
            <div className="p-3 rounded-xl bg-obsidian-surface/60 border border-emerald-500/20 min-w-0 space-y-1">
              <div className="flex items-center justify-between gap-1 text-[10px] text-emerald-300 uppercase font-semibold">
                <span className="truncate">Ganancia Neta (Mes Actual)</span>
                <span className="font-mono">Mes</span>
              </div>
              <div className={`text-base font-bold font-mono truncate ${realProfit.netMonthMXN >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {realProfit.netMonthMXN >= 0 ? '+' : '-'}$
                {formatMoney(Math.abs(profitCurrencyView === 'MXN' ? realProfit.netMonthMXN : realProfit.netMonthUSD))} {profitCurrencyView}
              </div>
              <div className="text-[11px] font-mono text-obsidian-muted truncate">
                Cobrado: ${formatMoney(profitCurrencyView === 'MXN' ? realProfit.monthIncomeMXN : realProfit.monthIncomeUSD)} • Gasto: ${formatMoney(profitCurrencyView === 'MXN' ? realProfit.totalMonthlyExpenseMXN : realProfit.totalMonthlyExpenseUSD)}
              </div>
            </div>

            {/* Ganancia Neta Anual */}
            <div className="p-3 rounded-xl bg-obsidian-surface/60 border border-obsidian-border min-w-0 space-y-1">
              <div className="flex items-center justify-between gap-1 text-[10px] text-obsidian-muted uppercase font-semibold">
                <span className="truncate">Ganancia Neta (Año Actual)</span>
                <span className="font-mono">Año</span>
              </div>
              <div className={`text-base font-bold font-mono truncate ${realProfit.netYearMXN >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {realProfit.netYearMXN >= 0 ? '+' : '-'}$
                {formatMoney(Math.abs(profitCurrencyView === 'MXN' ? realProfit.netYearMXN : realProfit.netYearUSD))} {profitCurrencyView}
              </div>
              <div className="text-[11px] font-mono text-obsidian-muted truncate">
                Cobrado: ${formatMoney(profitCurrencyView === 'MXN' ? realProfit.yearIncomeMXN : realProfit.yearIncomeUSD)} • Gasto: ${formatMoney(profitCurrencyView === 'MXN' ? realProfit.totalYearlyExpenseMXN : realProfit.totalYearlyExpenseUSD)}
              </div>
            </div>

            {/* Pendiente por Cobrar e Igualas */}
            <div className="p-3 rounded-xl bg-obsidian-surface/60 border border-obsidian-border min-w-0 space-y-1">
              <div className="flex items-center justify-between gap-1 text-[10px] text-amber-300 uppercase font-semibold">
                <span className="truncate">Pagos Pendientes por Cobrar</span>
                <Clock size={12} className="text-amber-400 shrink-0" />
              </div>
              <div className="text-base font-bold font-mono text-amber-300 truncate">
                ${formatMoney(profitCurrencyView === 'MXN' ? realProfit.pendingToCollectMXN : realProfit.pendingToCollectUSD)} {profitCurrencyView}
              </div>
              <div className="text-[11px] font-mono text-obsidian-muted truncate">
                Igualas mensuales: ${formatMoney(profitCurrencyView === 'MXN' ? realProfit.recurringRetainersMonthlyMXN : realProfit.recurringRetainersMonthlyMXN / fin.usdRate)}/mes
              </div>
            </div>
          </div>
        </div>

        {/* 1. Temporal Analysis: Weekly, Monthly, Annual (MXN & USD) + Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Weekly Spend */}
          <div className="p-4 rounded-xl bg-obsidian-surface/60 border border-obsidian-border min-w-0 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-obsidian-muted uppercase tracking-wider truncate">
                Gasto Semanal Total
              </span>
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">
                7 Días
              </span>
            </div>
            <div className="text-xl font-bold font-mono text-white truncate" title={`$${formatMoney(realProfit.totalWeeklyExpenseMXN)} MXN`}>
              ${formatMoney(realProfit.totalWeeklyExpenseMXN)} <span className="text-[11px] font-sans text-obsidian-muted">MXN</span>
            </div>
            <div className="text-xs font-mono text-emerald-400 truncate">
              ${formatMoney(realProfit.totalWeeklyExpenseUSD)} USD
            </div>
            <div className="text-[10px] font-mono text-obsidian-muted truncate pt-1 border-t border-obsidian-border/40">
              Fijo: ${formatMoney(realProfit.fixedWeeklyExpenseMXN)} • Variable: ${formatMoney(realProfit.variableWeekExpenseMXN)}
            </div>
          </div>

          {/* Monthly Spend */}
          <div className="p-4 rounded-xl bg-obsidian-surface/60 border border-indigo-500/30 min-w-0 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-indigo-300 uppercase tracking-wider truncate">
                Gasto Mensual Total
              </span>
              <span className="text-[10px] font-mono text-indigo-300 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/25">
                Mensual
              </span>
            </div>
            <div className="text-xl font-bold font-mono text-white truncate" title={`$${formatMoney(realProfit.totalMonthlyExpenseMXN)} MXN`}>
              ${formatMoney(realProfit.totalMonthlyExpenseMXN)} <span className="text-[11px] font-sans text-obsidian-muted">MXN</span>
            </div>
            <div className="text-xs font-mono text-emerald-400 truncate">
              ${formatMoney(realProfit.totalMonthlyExpenseUSD)} USD
            </div>
            <div className="text-[10px] font-mono text-obsidian-muted truncate pt-1 border-t border-obsidian-border/40">
              Fijo: ${formatMoney(realProfit.fixedMonthlyExpenseMXN)} • Compras: ${formatMoney(realProfit.variableMonthExpenseMXN)}
            </div>
          </div>

          {/* Annual Spend */}
          <div className="p-4 rounded-xl bg-obsidian-surface/60 border border-obsidian-border min-w-0 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-obsidian-muted uppercase tracking-wider truncate">
                Gasto Anual Estimado
              </span>
              <span className="text-[10px] font-mono text-purple-300 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">
                12 Meses
              </span>
            </div>
            <div className="text-xl font-bold font-mono text-white truncate" title={`$${formatMoney(realProfit.totalYearlyExpenseMXN)} MXN`}>
              ${formatMoney(realProfit.totalYearlyExpenseMXN)} <span className="text-[11px] font-sans text-obsidian-muted">MXN</span>
            </div>
            <div className="text-xs font-mono text-emerald-400 truncate">
              ${formatMoney(realProfit.totalYearlyExpenseUSD)} USD
            </div>
            <div className="text-[10px] font-mono text-obsidian-muted truncate pt-1 border-t border-obsidian-border/40">
              Fijo: ${formatMoney(realProfit.fixedYearlyExpenseMXN)} • Compras: ${formatMoney(realProfit.variableYearExpenseMXN)}
            </div>
          </div>

          {/* Key Metric: Avg Cost & Potential Savings */}
          <div className="p-4 rounded-xl bg-obsidian-surface/60 border border-emerald-500/25 min-w-0 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider truncate">
                Promedio por Cuenta y Ahorro
              </span>
              <PiggyBank size={14} className="text-emerald-400 flex-shrink-0" />
            </div>
            <div className="break-words text-sm font-bold font-mono text-white" title={`Promedio: $${formatMoney(fin.avgMonthlyPerActiveMXN)} MXN ($${formatMoney(fin.avgMonthlyPerActiveUSD)} USD)`}>
              Prom: ${formatMoney(fin.avgMonthlyPerActiveMXN)} MXN <span className="text-[10px] text-obsidian-muted">(${formatMoney(fin.avgMonthlyPerActiveUSD)} USD)</span>
            </div>
            <div className="text-[11px] font-mono text-emerald-400 truncate" title={`Ahorro potencial anual: $${formatMoney(fin.totalOptimizationPotentialYearlyMXN)} MXN`}>
              Ahorro posible: ${formatMoney(fin.totalOptimizationPotentialYearlyMXN)} MXN/año
            </div>
            {fin.alreadySavedMonthlyMXN > 0 && (
              <div className="text-[10px] font-mono text-obsidian-muted truncate">
                Ya ahorrado en pausadas: ${formatMoney(fin.alreadySavedMonthlyMXN)} MXN/mes
              </div>
            )}
          </div>
        </div>

        {/* 2. Spend Peaks (Max & Min): Month, Week, Top Service/Category, and Critical Charges */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
          {/* Peak vs Lowest Month */}
          <div className="p-4 rounded-xl bg-obsidian-bg/60 border border-obsidian-border space-y-2.5 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
                <TrendingUp size={13} className="text-rose-400 flex-shrink-0" />
                <span className="truncate">Mes con Más y Menos Gasto</span>
              </span>
              <InfoTooltip content="Muestra en qué mes del año tendrás más cobros acumulados (incluyendo pagos anuales) y en cuál pagarás menos." />
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="p-2 rounded-lg bg-rose-500/5 border border-rose-500/20 flex items-center justify-between gap-2 min-w-0">
                <div className="min-w-0">
                  <div className="text-[10px] text-rose-300 font-semibold uppercase">Mes Más Alto</div>
                  <div className="font-bold text-white truncate">{fin.peakMonth.monthName}</div>
                </div>
                <div className="text-right font-mono flex-shrink-0">
                  <div className="text-rose-300 font-bold">${formatMoney(fin.peakMonth.totalMXN)} MXN</div>
                  <div className="text-[10px] text-obsidian-muted">${formatMoney(fin.peakMonth.totalUSD)} USD</div>
                </div>
              </div>

              <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20 flex items-center justify-between gap-2 min-w-0">
                <div className="min-w-0">
                  <div className="text-[10px] text-emerald-300 font-semibold uppercase">Mes Más Bajo</div>
                  <div className="font-bold text-white truncate">{fin.lowestMonth.monthName}</div>
                </div>
                <div className="text-right font-mono flex-shrink-0">
                  <div className="text-emerald-300 font-bold">${formatMoney(fin.lowestMonth.totalMXN)} MXN</div>
                  <div className="text-[10px] text-obsidian-muted">${formatMoney(fin.lowestMonth.totalUSD)} USD</div>
                </div>
              </div>
            </div>
          </div>

          {/* Peak vs Lowest Week of Month */}
          <div className="p-4 rounded-xl bg-obsidian-bg/60 border border-obsidian-border space-y-2.5 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
                <Activity size={13} className="text-amber-400 flex-shrink-0" />
                <span className="truncate">Semana del Mes con Más Cobros</span>
              </span>
              <InfoTooltip content="Agrupa tus cobros según el día del mes en que se pagan (Semanas 1 a 4) para saber cuándo necesitas más saldo disponible." />
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/20 flex items-center justify-between gap-2 min-w-0">
                <div className="min-w-0">
                  <div className="text-[10px] text-amber-300 font-semibold uppercase">Semana Más Pesada ({fin.peakWeek.rangeLabel})</div>
                  <div className="font-bold text-white truncate">{fin.peakWeek.label}</div>
                </div>
                <div className="text-right font-mono flex-shrink-0">
                  <div className="text-amber-300 font-bold">${formatMoney(fin.peakWeek.totalMXN)} MXN</div>
                  <div className="text-[10px] text-obsidian-muted">${formatMoney(fin.peakWeek.totalUSD)} USD</div>
                </div>
              </div>

              <div className="p-2 rounded-lg bg-cyan-500/5 border border-cyan-500/20 flex items-center justify-between gap-2 min-w-0">
                <div className="min-w-0">
                  <div className="text-[10px] text-cyan-300 font-semibold uppercase">Semana Más Ligera ({fin.lowestWeek.rangeLabel})</div>
                  <div className="font-bold text-white truncate">{fin.lowestWeek.label}</div>
                </div>
                <div className="text-right font-mono flex-shrink-0">
                  <div className="text-cyan-300 font-bold">${formatMoney(fin.lowestWeek.totalMXN)} MXN</div>
                  <div className="text-[10px] text-obsidian-muted">${formatMoney(fin.lowestWeek.totalUSD)} USD</div>
                </div>
              </div>
            </div>
          </div>

          {/* Highest Financial Burden Service & Category */}
          <div className="p-4 rounded-xl bg-obsidian-bg/60 border border-obsidian-border space-y-2.5 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
                <Layers size={13} className="text-indigo-400 flex-shrink-0" />
                <span className="truncate">Servicio Donde Más Gastas</span>
              </span>
              <InfoTooltip content="Muestra la suscripción y la categoría que representan el mayor porcentaje de tu gasto mensual." />
            </div>

            {fin.topService ? (
              <div className="space-y-1.5 text-xs">
                <div
                  onClick={() => openInspector('platform', fin.topService!.platform.id)}
                  className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-between gap-2 cursor-pointer hover:bg-indigo-500/15 transition-colors min-w-0"
                >
                  <div className="min-w-0">
                    <div className="text-[10px] text-indigo-300 font-semibold uppercase">
                      Mayor Gasto ({fin.topService.sharePercent}% del total)
                    </div>
                    <div className="font-bold text-white truncate" title={fin.topService.platform.name}>
                      {fin.topService.platform.name}
                    </div>
                  </div>
                  <div className="text-right font-mono flex-shrink-0">
                    <div className="text-white font-bold">${formatMoney(fin.topService.monthlyMXN)} MXN</div>
                    <div className="text-[10px] text-obsidian-muted">${formatMoney(fin.topService.monthlyUSD)} USD/mes</div>
                  </div>
                </div>

                {fin.topCategory && (
                  <div className="p-2 rounded-lg bg-obsidian-surface/80 border border-obsidian-border flex items-center justify-between gap-2 min-w-0">
                    <div className="min-w-0">
                      <div className="text-[10px] text-obsidian-muted font-semibold uppercase">
                        Categoría Principal ({fin.topCategory.sharePercent}%)
                      </div>
                      <div className="font-bold text-white truncate" title={fin.topCategory.name}>
                        {fin.topCategory.name} ({fin.topCategory.count})
                      </div>
                    </div>
                    <div className="text-right font-mono flex-shrink-0">
                      <div className="text-emerald-400 font-bold">${formatMoney(fin.topCategory.monthlyMXN)} MXN</div>
                      <div className="text-[10px] text-obsidian-muted">${formatMoney(fin.topCategory.monthlyUSD)} USD</div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-obsidian-muted py-4 text-center">
                Sin servicios de pago activos.
              </div>
            )}
          </div>

          {/* Upcoming Critical Charges (Next 30 days) */}
          <div className="p-4 rounded-xl bg-obsidian-bg/60 border border-obsidian-border space-y-2.5 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
                <AlertTriangle size={13} className="text-amber-400 flex-shrink-0" />
                <span className="truncate">Próximos Cobros de Suscripciones</span>
              </span>
              <span className="text-[10px] font-mono text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 flex-shrink-0">
                30 días: ${formatMoney(fin.next30DaysTotalMXN, 0)} MXN
              </span>
            </div>

            {fin.criticalRenewals.length > 0 ? (
              <div className="space-y-1.5">
                {fin.criticalRenewals.slice(0, 2).map((item) => {
                  const isUrgent = item.daysUntil <= 7;
                  const daysLabel =
                    item.daysUntil < 0
                      ? `Venció hace ${Math.abs(item.daysUntil)}d`
                      : item.daysUntil === 0
                      ? 'Se cobra HOY'
                      : `En ${item.daysUntil} día(s)`;

                  return (
                    <div
                      key={item.platform.id}
                      onClick={() => openInspector('platform', item.platform.id)}
                      className={`p-2 rounded-lg border flex items-center justify-between gap-2 cursor-pointer transition-colors min-w-0 ${
                        isUrgent || item.isTrial
                          ? 'bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/15'
                          : 'bg-obsidian-surface/80 border-obsidian-border hover:bg-obsidian-surface'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-white text-xs truncate" title={item.platform.name}>
                          {item.platform.name}
                        </div>
                        <div className={`text-[10px] font-mono ${isUrgent || item.isTrial ? 'text-amber-300' : 'text-obsidian-muted'}`}>
                          {daysLabel} {item.isTrial ? '• Prueba gratis' : ''}
                        </div>
                      </div>
                      <div className="text-right font-mono flex-shrink-0">
                        <div className="text-xs font-bold text-emerald-400">
                          ${item.platform.subscription_cost} {item.platform.currency}
                        </div>
                        <div className="text-[10px] text-obsidian-muted">
                          ${formatMoney(item.amountMXN)} MXN
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-obsidian-muted py-4 text-center">
                Sin cobros próximos programados.
              </div>
            )}
          </div>
        </div>

        {/* 3. Tope de Gasto Mensual & Cotizaciones vs. Gasto Operativo */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-obsidian-border/60">
          {/* Tope de Gasto Mensual */}
          <div className="p-4 rounded-xl bg-obsidian-bg/70 border border-obsidian-border space-y-3 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Target size={14} className="text-indigo-400 shrink-0" />
                <span className="text-xs font-bold text-white truncate">
                  Límite de Gasto Mensual
                </span>
                <InfoTooltip
                  title="Límite de Presupuesto"
                  content="Te avisa cuando tus suscripciones se acercan (80%) o superan (100%) el monto máximo que definiste para gastar al mes."
                />
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {budgetCapEval.enabled && (
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                      budgetCapEval.level === 'critical'
                        ? 'bg-rose-500/15 text-rose-300 border-rose-500/35'
                        : budgetCapEval.level === 'warning'
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                        : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                    }`}
                  >
                    {budgetCapEval.level === 'critical'
                      ? 'Límite Superado'
                      : budgetCapEval.level === 'warning'
                      ? 'Cerca del Límite'
                      : 'Dentro del Límite'}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (!isUnlocked) openUnlockModal();
                    else setIsEditingCap(!isEditingCap);
                  }}
                  className="px-2 py-0.5 rounded-lg bg-obsidian-surface hover:bg-obsidian-border text-[10px] text-obsidian-text font-medium border border-obsidian-border"
                >
                  {isEditingCap ? 'Cancelar' : budgetCapEval.enabled ? 'Cambiar Límite' : 'Definir Límite'}
                </button>
              </div>
            </div>

            {isEditingCap && (
              <div className="p-2.5 rounded-xl bg-obsidian-surface border border-indigo-500/30 flex flex-wrap items-center gap-2 text-xs">
                <input
                  type="text"
                  inputMode="decimal"
                  maxLength={INPUT_LIMITS.BUDGET_CAP}
                  value={capAmountInput}
                  onChange={(e) => setCapAmountInput(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="Ej. 5000 (0 = desactivar)"
                  className="w-32 px-2.5 py-1 rounded-lg bg-obsidian-bg border border-obsidian-border text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
                <select
                  value={capCurrencyInput}
                  onChange={(e) => setCapCurrencyInput(e.target.value as 'MXN' | 'USD')}
                  className="px-2 py-1 rounded-lg bg-obsidian-bg border border-obsidian-border text-white text-xs"
                >
                  <option value="MXN">MXN</option>
                  <option value="USD">USD</option>
                </select>
                <button
                  type="button"
                  onClick={handleSaveBudgetCap}
                  className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold"
                >
                  Guardar
                </button>
              </div>
            )}

            {budgetCapEval.enabled ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                  <span className="text-obsidian-muted">
                    Gastando: <strong className="text-white">${formatMoney(fin.monthlyMXN)} MXN</strong> ({budgetCapEval.usagePercent.toFixed(1)}%)
                  </span>
                  <span className="text-indigo-300 font-semibold">
                    Límite: ${formatMoney(budgetCapEval.capMXN)} MXN (${formatMoney(budgetCapEval.capUSD)} USD)
                  </span>
                </div>

                <div className="w-full h-2.5 rounded-full bg-obsidian-surface overflow-hidden">
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

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-obsidian-muted font-mono">
                  <span>
                    Mes más alto ({fin.peakMonth.shortName}):{' '}
                    <strong className={budgetCapEval.peakUsagePercent >= 100 ? 'text-rose-400' : 'text-white'}>
                      {budgetCapEval.peakUsagePercent.toFixed(1)}% del límite
                    </strong>
                  </span>
                  <span>
                    {budgetCapEval.usagePercent >= 100
                      ? `Excedido por $${formatMoney(fin.monthlyMXN - budgetCapEval.capMXN)} MXN`
                      : `Disponible: $${formatMoney(budgetCapEval.capMXN - fin.monthlyMXN)} MXN`}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-obsidian-muted py-2">
                Sin límite mensual activo. Define un tope para recibir avisos si tus suscripciones suben demasiado.
              </div>
            )}
          </div>

          {/* Cotizaciones vs. Gasto Operativo */}
          <div className="p-4 rounded-xl bg-obsidian-bg/70 border border-obsidian-border space-y-3 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Briefcase size={14} className="text-emerald-400 shrink-0" />
                <span className="text-xs font-bold text-white truncate">
                  Cotizaciones de Prospectos vs. Gasto Operativo
                </span>
                <InfoTooltip
                  title="Proyección Comercial"
                  content="Compara el valor estimado de tus prospectos en negociación y cerrados frente a lo que pagas mensualmente en herramientas."
                />
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <div className="flex items-center p-0.5 rounded-lg bg-obsidian-surface border border-obsidian-border text-[10px] font-mono">
                  {(['MXN', 'USD'] as const).map((curr) => (
                    <button
                      key={curr}
                      type="button"
                      onClick={() => setPipelineCurrencyView(curr)}
                      className={`px-2 py-0.5 rounded transition-colors ${
                        pipelineCurrencyView === curr
                          ? 'bg-indigo-600 text-white font-semibold'
                          : 'text-obsidian-muted hover:text-white'
                      }`}
                    >
                      {curr}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveSection('prospects')}
                  className="px-2 py-0.5 rounded-lg bg-obsidian-surface hover:bg-obsidian-border text-[10px] text-indigo-300 border border-obsidian-border font-medium"
                >
                  Ver Prospectos
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-obsidian-surface/80 border border-obsidian-border min-w-0">
                <div className="text-[10px] text-obsidian-muted font-sans uppercase truncate">En Negociación ({pipelineSummary.activeCount})</div>
                <div className="font-bold text-indigo-300 truncate mt-0.5">
                  ${formatMoney(pipelineCurrencyView === 'MXN' ? pipelineSummary.activePipelineMXN : pipelineSummary.activePipelineUSD)} {pipelineCurrencyView}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-obsidian-surface/80 border border-obsidian-border min-w-0">
                <div className="text-[10px] text-obsidian-muted font-sans uppercase truncate">Respondidos ({pipelineSummary.closedWonCount})</div>
                <div className="font-bold text-emerald-400 truncate mt-0.5">
                  ${formatMoney(pipelineCurrencyView === 'MXN' ? pipelineSummary.closedWonMXN : pipelineSummary.closedWonUSD)} {pipelineCurrencyView}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 min-w-0">
                <div className="text-[10px] text-emerald-300 font-sans uppercase truncate">Meses Cubiertos</div>
                <div className="font-bold text-white truncate mt-0.5">
                  {pipelineSummary.monthlyCostCoverageRatio > 0
                    ? `${pipelineSummary.monthlyCostCoverageRatio.toFixed(1)} meses`
                    : '0 meses'}
                </div>
                <div className="text-[10px] text-obsidian-muted truncate">
                  {pipelineSummary.annualCostCoverageRatio.toFixed(2)}x del gasto anual
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Status Distribution & Lowest Cost Service Footer Bar */}
        <div className="pt-3 border-t border-obsidian-border/60 flex flex-wrap items-center justify-between gap-3 text-xs text-obsidian-muted">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              Suscripciones: <strong className="text-emerald-400">{fin.paidActiveCount} Activas de Pago</strong>
            </span>
            <span>•</span>
            <span>
              <strong className="text-amber-300">{fin.freeTrialCount} Pruebas Gratis</strong>
            </span>
            <span>•</span>
            <span>
              <strong className="text-white/80">{fin.pausedCount} Pausadas</strong> / <strong className="text-rose-400">{fin.cancelledCount} Canceladas</strong>
            </span>
          </div>

          {fin.lowestPaidService && (
            <div className="flex items-center gap-1.5 font-mono text-[11px] min-w-0">
              <TrendingDown size={13} className="text-emerald-400 flex-shrink-0" />
              <span className="truncate">
                Suscripción más económica: <strong className="text-white">{fin.lowestPaidService.platform.name}</strong> (${formatMoney(fin.lowestPaidService.monthlyMXN)} MXN / ${formatMoney(fin.lowestPaidService.monthlyUSD)} USD)
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* ===================================================================== */}
      {/* MÓDULO 1: CONTROL DE INGRESOS Y PAGOS RECIBIDOS                       */}
      {/* ===================================================================== */}
      <div className="p-5 sm:p-6 rounded-2xl bg-obsidian-panel border border-obsidian-border space-y-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-obsidian-border/70">
          <div className="flex items-center gap-2 min-w-0">
            <Wallet size={16} className="text-emerald-400 shrink-0" />
            <h3 className="text-sm font-bold text-white tracking-tight truncate">
              Control de Ingresos y Pagos Recibidos ({filteredIncomes.length})
            </h3>
            <InfoTooltip content="Registra los anticipos, liquidaciones de páginas web e igualas mensuales de mantenimiento que te pagan tus clientes para calcular tu ganancia neta real." />
          </div>
          <button
            type="button"
            onClick={openNewIncomeModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-all shrink-0"
          >
            <Plus size={13} />
            <span>Registrar Pago</span>
          </button>
        </div>

        {filteredIncomes.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredIncomes.map((inc) => {
              const catMeta = INCOME_CATEGORIES.find((c) => c.value === inc.category) || INCOME_CATEGORIES[0];
              const isPaid = inc.status === 'cobrado';
              return (
                <div
                  key={inc.id}
                  className="p-4 rounded-xl bg-obsidian-surface/60 border border-obsidian-border hover:border-obsidian-borderLight transition-all space-y-2.5 min-w-0 flex flex-col justify-between"
                >
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-bold text-white text-xs block truncate" title={inc.client_name}>
                          {inc.client_name}
                        </span>
                        <span className="text-[11px] text-obsidian-muted block truncate" title={inc.concept}>
                          {inc.concept}
                        </span>
                      </div>
                      <span className={`font-mono text-xs font-bold shrink-0 ${isPaid ? 'text-emerald-400' : 'text-amber-300'}`}>
                        ${formatMoney(inc.amount)} {inc.currency}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${catMeta.badge}`}>
                        {catMeta.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleToggleIncomeStatus(inc)}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors ${
                          isPaid
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
                            : 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
                        }`}
                        title="Clic para cambiar entre Cobrado y Pendiente"
                      >
                        {isPaid ? 'Cobrado' : 'Pendiente por cobrar'}
                      </button>
                      {inc.is_recurring && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                          Mensual
                        </span>
                      )}
                      {inc.scope && inc.scope !== 'business' && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-purple-500/10 text-purple-300 border border-purple-500/20 capitalize">
                          {inc.scope === 'personal' ? 'Personal' : 'Compartido'}
                        </span>
                      )}
                    </div>

                    {inc.notes && (
                      <p className="text-[11px] text-obsidian-muted line-clamp-2 break-words" title={inc.notes}>
                        {inc.notes}
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-obsidian-border/50 flex items-center justify-between gap-2 text-[10px] text-obsidian-muted font-mono">
                    <span className="truncate">
                      {inc.received_date} {inc.payment_method_label ? `• ${inc.payment_method_label}` : ''}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {(inc.is_recurring || inc.category === 'iguala_mensual') && (
                        <button
                          type="button"
                          onClick={() => handleCloneIncome(inc)}
                          className="px-2 py-0.5 rounded bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-[10px] font-sans font-semibold inline-flex items-center gap-1"
                          title="Repetir cobro (+1 mes) al mes siguiente"
                        >
                          <Repeat size={10} />
                          <span>+1 mes</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEditIncomeModal(inc)}
                        className="p-1 text-obsidian-muted hover:text-white rounded hover:bg-obsidian-panel"
                        title="Editar pago"
                      >
                        <Edit3 size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteIncome(inc)}
                        className="p-1 text-obsidian-muted hover:text-rose-400 rounded hover:bg-obsidian-panel"
                        title="Enviar a la papelera"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 px-4 rounded-xl bg-obsidian-bg/50 border border-obsidian-border text-center space-y-2">
            <p className="text-xs text-obsidian-muted">
              Aún no has registrado pagos recibidos de clientes (anticipos, liquidaciones o igualas mensuales).
            </p>
            <button
              type="button"
              onClick={openNewIncomeModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-xs font-semibold"
            >
              <Plus size={13} />
              <span>Registrar Primer Pago de Cliente</span>
            </button>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* ===================================================================== */}
      {/* MÓDULO 2: MONITOR DE VENCIMIENTOS (DOMINIOS Y HOSTING DE CLIENTES)    */}
      {/* ===================================================================== */}
      <div className="p-5 sm:p-6 rounded-2xl bg-obsidian-panel border border-obsidian-border space-y-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-obsidian-border/70">
          <div className="flex items-center gap-2 min-w-0">
            <Server size={16} className="text-cyan-400 shrink-0" />
            <h3 className="text-sm font-bold text-white tracking-tight truncate">
              Monitor de Vencimientos: Dominios y Hosting ({filteredRenewals.length})
            </h3>
            <InfoTooltip content="Controla cuándo vence el dominio o alojamiento de cada página web creada, cuánto cuesta renovarlo y si el pago corre por tu cuenta o por cuenta del cliente." />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono text-obsidian-muted">
              Por mi cuenta: <strong className="text-rose-300">${formatMoney(realProfit.myRenewalsYearlyMXN)} MXN/año</strong>
            </span>
            <span className="text-obsidian-muted">•</span>
            <span className="text-[11px] font-mono text-obsidian-muted">
              Paga el cliente: <strong className="text-emerald-300">${formatMoney(realProfit.clientRenewalsYearlyMXN)} MXN/año</strong>
            </span>
            <button
              type="button"
              onClick={openNewRenewalModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition-all shrink-0"
            >
              <Plus size={13} />
              <span>Agregar Dominio / Hosting</span>
            </button>
          </div>
        </div>

        {filteredRenewals.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredRenewals.map((ren) => {
              const srvMeta = RENEWAL_SERVICE_TYPES.find((s) => s.value === ren.service_type) || RENEWAL_SERVICE_TYPES[0];
              const isUrgent = ren.expiry_semaphore === 'urgente' || ren.expiry_semaphore === 'vencido';
              const isSoon = ren.expiry_semaphore === 'proximo';
              const paidByMe = ren.paid_by === 'me';

              const daysText =
                ren.days_remaining < 0
                  ? `Venció hace ${Math.abs(ren.days_remaining)} día(s)`
                  : ren.days_remaining === 0
                  ? 'Vence HOY'
                  : `Vence en ${ren.days_remaining} día(s)`;

              return (
                <div
                  key={ren.id}
                  className={`p-4 rounded-xl border transition-all space-y-2.5 min-w-0 flex flex-col justify-between ${
                    isUrgent
                      ? 'bg-rose-500/5 border-rose-500/30'
                      : isSoon
                      ? 'bg-amber-500/5 border-amber-500/30'
                      : 'bg-obsidian-surface/60 border-obsidian-border hover:border-obsidian-borderLight'
                  }`}
                >
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-bold text-white text-xs block truncate" title={ren.domain_or_service}>
                          {ren.domain_or_service}
                        </span>
                        <span className="text-[11px] text-obsidian-muted block truncate" title={ren.client_name}>
                          Cliente: <strong className="text-white/80">{ren.client_name}</strong>
                          {ren.provider ? ` • ${ren.provider}` : ''}
                        </span>
                      </div>
                      <div className="text-right font-mono shrink-0">
                        <span className="text-xs font-bold text-white block">
                          ${formatMoney(ren.renewal_cost)} {ren.currency}
                        </span>
                        <span className="text-[10px] text-obsidian-muted block">
                          {ren.billing_cycle === 'monthly' ? 'Mensual' : 'Anual'}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-obsidian-panel border border-obsidian-border text-obsidian-text">
                        {srvMeta.label}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                          paidByMe
                            ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                            : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        }`}
                      >
                        {paidByMe ? 'Pago por mi cuenta' : 'Pago por cuenta del cliente'}
                      </span>
                      {ren.client_charge_amount && ren.client_charge_amount > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                          Cobro al cliente: ${formatMoney(ren.client_charge_amount)}
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${
                          isUrgent
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                            : isSoon
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20'
                        }`}
                      >
                        {daysText}
                      </span>
                      {ren.scope && ren.scope !== 'business' && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-purple-500/10 text-purple-300 border border-purple-500/20 capitalize">
                          {ren.scope === 'personal' ? 'Personal' : 'Compartido'}
                        </span>
                      )}
                    </div>

                    {ren.notes && (
                      <p className="text-[11px] text-obsidian-muted line-clamp-2 break-words" title={ren.notes}>
                        {ren.notes}
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-obsidian-border/50 flex items-center justify-between gap-2 text-[10px] text-obsidian-muted font-mono">
                    <span className="truncate">Fecha: {ren.renewal_date}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenAdvanceRenewalModal(ren)}
                        className="px-2 py-0.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[10px] font-sans font-semibold inline-flex items-center gap-1"
                        title="Marcar como renovado y registrar cobro en ingresos si aplica"
                      >
                        <RefreshCw size={10} />
                        <span>Renovar +1 ciclo</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditRenewalModal(ren)}
                        className="p-1 text-obsidian-muted hover:text-white rounded hover:bg-obsidian-panel"
                        title="Editar vencimiento"
                      >
                        <Edit3 size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRenewal(ren)}
                        className="p-1 text-obsidian-muted hover:text-rose-400 rounded hover:bg-obsidian-panel"
                        title="Enviar a la papelera"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 px-4 rounded-xl bg-obsidian-bg/50 border border-obsidian-border text-center space-y-2">
            <p className="text-xs text-obsidian-muted">
              No hay dominios ni hostings de clientes registrados en el monitor de vencimientos.
            </p>
            <button
              type="button"
              onClick={openNewRenewalModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 text-xs font-semibold"
            >
              <Plus size={13} />
              <span>Registrar Primer Dominio o Hosting</span>
            </button>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* MÓDULO 3: GASTOS ÚNICOS Y COMPRAS VARIABLES (NO RECURRENTES)          */}
      {/* ===================================================================== */}
      <div className="p-5 sm:p-6 rounded-2xl bg-obsidian-panel border border-obsidian-border space-y-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-obsidian-border/70">
          <div className="flex items-center gap-2 min-w-0">
            <Receipt size={16} className="text-purple-400 shrink-0" />
            <h3 className="text-sm font-bold text-white tracking-tight truncate">
              Gastos Únicos y Compras Variables ({filteredExpenses.length})
            </h3>
            <InfoTooltip content="Registra compras no recurrentes (hardware, laptops, licencias vitalicias, insumos, mobiliario) para deducirlas de tu ganancia neta real sin alterar tus suscripciones mensuales." />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono text-obsidian-muted">
              Total este mes: <strong className="text-purple-300">${formatMoney(profitCurrencyView === 'MXN' ? realProfit.variableMonthExpenseMXN : realProfit.variableMonthExpenseUSD)} {profitCurrencyView}</strong>
            </span>
            <span className="text-obsidian-muted">•</span>
            <span className="text-[11px] font-mono text-obsidian-muted">
              Total del año: <strong className="text-white/80">${formatMoney(profitCurrencyView === 'MXN' ? realProfit.variableYearExpenseMXN : realProfit.variableYearExpenseUSD)} {profitCurrencyView}</strong>
            </span>
            <button
              type="button"
              onClick={openNewExpenseModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-sm transition-all shrink-0"
            >
              <Plus size={13} />
              <span>Registrar Gasto Único</span>
            </button>
          </div>
        </div>

        {filteredExpenses.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredExpenses.map((exp) => (
              <div
                key={exp.id}
                className="p-4 rounded-xl bg-obsidian-surface/60 border border-obsidian-border hover:border-obsidian-borderLight transition-all space-y-2.5 min-w-0 flex flex-col justify-between"
              >
                <div className="space-y-2 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-bold text-white text-xs block truncate" title={exp.concept}>
                        {exp.concept}
                      </span>
                      <span className="text-[11px] text-obsidian-muted block truncate">
                        {exp.category}
                      </span>
                    </div>
                    <span className="font-mono text-xs font-bold text-purple-300 shrink-0">
                      ${formatMoney(exp.amount)} {exp.currency}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-300 border border-purple-500/25">
                      {exp.category}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-obsidian-panel border border-obsidian-border text-obsidian-text capitalize">
                      {exp.scope === 'business' ? 'Empresa' : exp.scope === 'personal' ? 'Personal' : 'Compartido'}
                    </span>
                  </div>

                  {exp.notes && (
                    <p className="text-[11px] text-obsidian-muted line-clamp-2 break-words" title={exp.notes}>
                      {exp.notes}
                    </p>
                  )}
                </div>

                <div className="pt-2 border-t border-obsidian-border/50 flex items-center justify-between gap-2 text-[10px] text-obsidian-muted font-mono">
                  <span className="truncate">
                    {exp.expense_date} {exp.payment_method_label ? `• ${exp.payment_method_label}` : ''}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditExpenseModal(exp)}
                      className="p-1 text-obsidian-muted hover:text-white rounded hover:bg-obsidian-panel"
                      title="Editar gasto único"
                    >
                      <Edit3 size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteExpense(exp)}
                      className="p-1 text-obsidian-muted hover:text-rose-400 rounded hover:bg-obsidian-panel"
                      title="Enviar a la papelera"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 px-4 rounded-xl bg-obsidian-bg/50 border border-obsidian-border text-center space-y-2">
            <p className="text-xs text-obsidian-muted">
              No hay compras ni gastos únicos variables registrados (hardware, licencias vitalicias, insumos, etc.).
            </p>
            <button
              type="button"
              onClick={openNewExpenseModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 text-xs font-semibold"
            >
              <Plus size={13} />
              <span>Registrar Primer Gasto Único</span>
            </button>
          </div>
        )}
      </div>

      {/* Payment Cards Grid */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-bold text-white tracking-tight">
            Tarjetas y Métodos de Pago ({filteredPaymentMethods.length})
          </h3>
          <InfoTooltip content="Los números de tarjeta, código CVV y notas privadas se guardan encriptados en tu base de datos local." />
        </div>

        {filteredPaymentMethods.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPaymentMethods.map((pay) => {
              const linked = platforms.filter((p) => p.payment_method_id === pay.id);

              return (
                <div
                  key={pay.id}
                  className="p-5 rounded-2xl bg-gradient-to-br from-obsidian-panel to-obsidian-card border border-obsidian-border hover:border-obsidian-borderLight transition-all space-y-4 shadow-xl min-w-0 overflow-hidden"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-bold text-white text-sm block truncate" title={pay.alias}>{pay.alias}</span>
                      <span className="text-[11px] text-obsidian-muted truncate block">{pay.issuer}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <div className="px-2.5 py-1 rounded-xl bg-obsidian-surface border border-obsidian-border text-white font-mono text-xs font-bold">
                        *{pay.last_four}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!isUnlocked) openUnlockModal();
                          else openPaymentModal(pay);
                        }}
                        title="Editar tarjeta"
                        className="p-1.5 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface transition-colors"
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePaymentMethod(pay)}
                        title="Enviar tarjeta a la papelera"
                        className="p-1.5 text-obsidian-muted hover:text-rose-400 rounded-lg hover:bg-obsidian-surface transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-obsidian-surface/60 border border-obsidian-border text-xs space-y-2">
                    <div>
                      <div className="text-obsidian-muted text-[10px]">Número de Tarjeta / Cuenta</div>
                      <SecretField
                        value={pay.card_number_plain}
                        masked={pay.card_number_masked}
                        label={`Tarjeta ${pay.alias}`}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-obsidian-muted font-mono pt-1 border-t border-obsidian-border/50">
                      <span>
                        {pay.expiry_month && pay.expiry_year ? `Vence: ${pay.expiry_month}/${pay.expiry_year}` : 'Sin fecha de vencimiento'}
                      </span>
                    </div>
                  </div>

                  {pay.billing_notes && (
                    <p className="text-[11px] text-obsidian-muted line-clamp-2 break-words" title={pay.billing_notes}>
                      {pay.billing_notes}
                    </p>
                  )}

                  {/* Subscriptions tied to this card */}
                  <div>
                    <span className="text-[10px] text-obsidian-muted font-semibold uppercase tracking-wider block mb-1.5">
                      Suscripciones con esta tarjeta ({linked.length})
                    </span>
                    <div className="space-y-1">
                      {linked.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => openInspector('platform', item.id)}
                          className="flex items-center justify-between gap-2 p-2 rounded-lg bg-obsidian-bg hover:bg-obsidian-surface border border-obsidian-border text-xs cursor-pointer transition-colors min-w-0"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <PlatformIcon name={item.name} iconUrl={item.icon_url} size="sm" />
                            <div className="min-w-0">
                              <span className="text-white font-medium truncate block" title={item.name}>{item.name}</span>
                              {item.email_address && (
                                <span className="text-[10px] text-obsidian-muted font-mono truncate block" title={item.email_address}>
                                  {item.email_address}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="font-mono text-emerald-400 font-semibold flex-shrink-0">
                            ${item.subscription_cost} {item.currency}
                          </span>
                        </div>
                      ))}
                      {linked.length === 0 && (
                        <div className="text-[11px] text-obsidian-muted italic">
                          Sin suscripciones vinculadas.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-10 px-4 rounded-2xl bg-obsidian-panel border border-obsidian-border text-center space-y-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto">
              <CreditCard size={20} />
            </div>
            <h4 className="text-sm font-semibold text-white">No hay tarjetas registradas</h4>
            <button
              type="button"
              onClick={() => {
                if (!isUnlocked) openUnlockModal();
                else openPaymentModal();
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
            >
              <Plus size={14} />
              <span>Registrar Primera Tarjeta</span>
            </button>
          </div>
        )}
      </div>

      {/* Next Renewals Timeline & Trial Alerts with Direct Principal Email Link */}
      <div className="space-y-4 pt-4 border-t border-obsidian-border">
        <div className="flex items-center gap-2">
          <Calendar className="text-cyan-400 w-4 h-4 flex-shrink-0" />
          <h3 className="text-sm font-bold text-white tracking-tight truncate">
            Calendario de Suscripciones y Pruebas Gratis ({activeOrTrialPlatforms.length})
          </h3>
          <InfoTooltip content="Cuando llega la fecha de cobro de una suscripción activa, el sistema actualiza automáticamente la fecha al siguiente mes o año." />
        </div>

        {activeOrTrialPlatforms.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeOrTrialPlatforms.map((p) => {
              const isTrial = p.subscription_status === 'free_trial';
              return (
                <div
                  key={p.id}
                  onClick={() => openInspector('platform', p.id)}
                  className="p-4 rounded-xl bg-obsidian-surface/60 hover:bg-obsidian-surface border border-obsidian-border hover:border-cyan-500/30 transition-all cursor-pointer space-y-2.5 group min-w-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <PlatformIcon name={p.name} iconUrl={p.icon_url} size="sm" />
                      <div className="min-w-0">
                        <span className="font-semibold text-white text-xs block group-hover:text-cyan-300 transition-colors truncate" title={p.name}>
                          {p.name}
                        </span>
                        <span className="text-[10px] text-obsidian-muted capitalize block truncate">
                          Cobro: {p.billing_cycle === 'yearly' ? 'Anual' : p.billing_cycle === 'weekly' ? 'Semanal' : 'Mensual'}
                        </span>
                      </div>
                    </div>

                    <span className="font-mono text-xs font-bold text-emerald-400 flex-shrink-0">
                      ${p.subscription_cost} {p.currency}
                    </span>
                  </div>

                  {/* Direct Link to Principal Email */}
                  {p.email_address && (
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (p.email_id) openInspector('email', p.email_id);
                        }}
                        title={`Ver correo principal: ${p.email_address}`}
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-obsidian-panel hover:bg-indigo-500/15 border border-obsidian-border hover:border-indigo-500/30 text-[10px] font-mono text-obsidian-muted hover:text-indigo-300 transition-colors max-w-full min-w-0"
                      >
                        <Mail size={10} className="text-indigo-400 flex-shrink-0" />
                        <span className="truncate">{p.email_address}</span>
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 text-[11px] pt-1 border-t border-obsidian-border/40">
                    <span className="text-obsidian-muted flex items-center gap-1 font-mono truncate">
                      <Calendar className="w-3 h-3 text-white/40 flex-shrink-0" />
                      <span className="truncate">{p.next_billing_date ? `Próximo cobro: ${p.next_billing_date}` : 'Sin fecha'}</span>
                    </span>

                    {isTrial ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20 flex-shrink-0">
                        Prueba Gratis
                      </span>
                    ) : (
                      <span className="text-white/40 text-[10px] truncate max-w-[120px]" title={p.payment_alias || 'Sin tarjeta'}>
                        {p.payment_alias || 'Sin tarjeta'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-10 px-4 rounded-2xl bg-obsidian-panel border border-obsidian-border text-center text-xs text-obsidian-muted">
            No hay suscripciones activas ni pruebas gratuitas registradas.
          </div>
        )}
      </div>

      {/* Historial de Cobros de Suscripciones */}
      {billingHistory.length > 0 && (
        <div className="space-y-3 pt-4 border-t border-obsidian-border">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <History size={15} className="text-emerald-400 shrink-0" />
              <h3 className="text-sm font-bold text-white tracking-tight truncate">
                Historial de Cobros Automáticos ({billingHistory.length})
              </h3>
              <InfoTooltip content="Registro de suscripciones que cumplieron su fecha de pago y avanzaron al siguiente periodo." />
            </div>
            <button
              type="button"
              onClick={() => setActiveSection('audit_logs')}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
            >
              Ver Historial de Actividad
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {billingHistory.slice(0, 6).map((rec) => (
              <div
                key={rec.id}
                onClick={() => openInspector('platform', rec.platform_id)}
                className="p-3 rounded-xl bg-obsidian-panel border border-obsidian-border hover:border-emerald-500/30 transition-all cursor-pointer flex items-center justify-between gap-2 min-w-0"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                    <span className="font-bold text-white text-xs truncate">{rec.platform_name}</span>
                  </div>
                  <div className="text-[10px] text-obsidian-muted font-mono truncate mt-0.5">
                    Fecha: {rec.charged_date || rec.billing_date} • Ciclo: {rec.billing_cycle}
                  </div>
                </div>
                <span className="font-mono text-xs font-bold text-emerald-400 shrink-0">
                  ${rec.amount} {rec.currency}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: REGISTRAR / EDITAR PAGO RECIBIDO DE CLIENTE                    */}
      {/* ===================================================================== */}
      {isIncomeModalOpen && (
        <div className="responsive-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div
            className="relative w-full max-w-lg bg-obsidian-panel border border-obsidian-borderLight rounded-2xl shadow-2xl p-6 overflow-y-auto max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-obsidian-border">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 shrink-0">
                  <Wallet size={18} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white truncate">
                    {editingIncome ? 'Editar Pago de Cliente' : 'Registrar Pago Recibido de Cliente'}
                  </h3>
                  <p className="text-[11px] text-obsidian-muted truncate">
                    Anticipos, liquidaciones de sitios web e igualas mensuales
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsIncomeModalOpen(false)}
                className="p-1.5 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveIncome} className="space-y-4 pt-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-obsidian-text font-medium mb-1">
                    Vincular con Prospecto / Cliente (Opcional)
                  </label>
                  {!showQuickClientInInc ? (
                    <select
                      value={incProspectId}
                      onChange={(e) => {
                        const pid = e.target.value;
                        if (pid === '__create__') {
                          setShowQuickClientInInc(true);
                          return;
                        }
                        setIncProspectId(pid);
                        const found = prospects.find((pr) => pr.id === pid);
                        if (found && !incClientName.trim()) {
                          setIncClientName(found.company_name);
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">-- Escribir nombre manualmente --</option>
                      <option value="__create__" className="text-emerald-400 font-semibold">+ Crear nuevo cliente aquí...</option>
                      {prospects.map((pr) => (
                        <option key={pr.id} value={pr.id}>
                          {pr.company_name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        autoFocus
                        value={quickClientNameInInc}
                        onChange={(e) => setQuickClientNameInInc(e.target.value)}
                        placeholder="Nombre del nuevo cliente"
                        className="flex-1 px-3 py-2 rounded-xl bg-obsidian-bg border border-emerald-500 text-white focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={creatingQuickClientInInc || !quickClientNameInInc.trim()}
                        onClick={handleQuickCreateClientInInc}
                        className="px-2.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold disabled:opacity-50"
                      >
                        {creatingQuickClientInInc ? '...' : 'Crear'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowQuickClientInInc(false);
                          setQuickClientNameInInc('');
                        }}
                        className="p-2 text-obsidian-muted hover:text-white rounded-xl bg-obsidian-surface"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-obsidian-text font-medium mb-1">
                    Nombre del Cliente o Negocio *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={180}
                    value={incClientName}
                    onChange={(e) => setIncClientName(e.target.value)}
                    placeholder="Ej. Mueblería Central"
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-obsidian-text font-medium mb-1">
                    Ámbito (Personal vs Empresa) *
                  </label>
                  <select
                    value={incScope}
                    onChange={(e) => setIncScope(e.target.value as EntityScope)}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="business">Empresa / Negocio</option>
                    <option value="personal">Personal</option>
                    <option value="shared">Compartido</option>
                  </select>
                </div>

                <div>
                  <label className="block text-obsidian-text font-medium mb-1">
                    Tipo de Pago *
                  </label>
                  <select
                    value={incCategory}
                    onChange={(e) => {
                      const cat = e.target.value as IncomeCategory;
                      setIncCategory(cat);
                      if (cat === 'iguala_mensual') setIncRecurring(true);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
                  >
                    {INCOME_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-obsidian-text font-medium mb-1">
                  Concepto / Descripción *
                </label>
                <input
                  type="text"
                  required
                  maxLength={180}
                  value={incConcept}
                  onChange={(e) => setIncConcept(e.target.value)}
                  placeholder="Ej. Anticipo 50% página web"
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-obsidian-text font-medium mb-1">Monto *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={incAmount}
                    onChange={(e) => setIncAmount(e.target.value)}
                    placeholder="3500"
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-obsidian-text font-medium mb-1">Moneda</label>
                  <select
                    value={incCurrency}
                    onChange={(e) => setIncCurrency(e.target.value as 'MXN' | 'USD')}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-mono focus:outline-none focus:border-indigo-500"
                  >
                    <option value="MXN">MXN</option>
                    <option value="USD">USD</option>
                  </select>
                </div>

                <div>
                  <label className="block text-obsidian-text font-medium mb-1">Estado</label>
                  <select
                    value={incStatus}
                    onChange={(e) => setIncStatus(e.target.value as IncomeStatus)}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="cobrado">Ya cobrado</option>
                    <option value="pendiente">Pendiente por cobrar</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-obsidian-text font-medium mb-1">Fecha de Pago</label>
                  <input
                    type="date"
                    required
                    value={incDate}
                    onChange={(e) => setIncDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-obsidian-text font-medium mb-1">Medio de Pago</label>
                  <input
                    type="text"
                    maxLength={64}
                    value={incMethod}
                    onChange={(e) => setIncMethod(e.target.value)}
                    placeholder="Transferencia SPEI, Efectivo, Tarjeta..."
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-obsidian-text">
                <input
                  type="checkbox"
                  checked={incRecurring}
                  onChange={(e) => setIncRecurring(e.target.checked)}
                  className="rounded bg-obsidian-bg border-obsidian-border text-emerald-500 focus:ring-0"
                />
                <span>Es una iguala mensual fija (mantenimiento recurrente cada mes)</span>
              </label>

              <div>
                <label className="block text-obsidian-text font-medium mb-1">
                  Notas Privadas (Se guardan encriptadas)
                </label>
                <textarea
                  rows={2}
                  maxLength={INPUT_LIMITS.NOTES}
                  value={incNotes}
                  onChange={(e) => setIncNotes(e.target.value)}
                  placeholder="Detalles adicionales del acuerdo o comprobante..."
                  className="w-full p-2.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="pt-3 border-t border-obsidian-border flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsIncomeModalOpen(false)}
                  className="px-4 py-2 text-obsidian-muted hover:text-white font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingIncome}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-md shadow-emerald-600/20 disabled:opacity-50"
                >
                  {savingIncome ? 'Guardando...' : editingIncome ? 'Guardar Cambios' : 'Registrar Pago'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: REGISTRAR / EDITAR VENCIMIENTO DE DOMINIO O HOSTING            */}
      {/* ===================================================================== */}
      {isRenewalModalOpen && (
        <div className="responsive-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div
            className="relative w-full max-w-lg bg-obsidian-panel border border-obsidian-borderLight rounded-2xl shadow-2xl p-6 overflow-y-auto max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-obsidian-border">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 shrink-0">
                  <Server size={18} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white truncate">
                    {editingRenewal ? 'Editar Dominio o Hosting' : 'Registrar Vencimiento de Dominio o Hosting'}
                  </h3>
                  <p className="text-[11px] text-obsidian-muted truncate">
                    Controla fechas de renovación y quién cubre el costo
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRenewalModalOpen(false)}
                className="p-1.5 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveRenewal} className="space-y-4 pt-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-obsidian-text font-medium mb-1">
                    Vincular con Prospecto / Cliente (Opcional)
                  </label>
                  {!showQuickClientInRen ? (
                    <select
                      value={renProspectId}
                      onChange={(e) => {
                        const pid = e.target.value;
                        if (pid === '__create__') {
                          setShowQuickClientInRen(true);
                          return;
                        }
                        setRenProspectId(pid);
                        const found = prospects.find((pr) => pr.id === pid);
                        if (found && !renClientName.trim()) {
                          setRenClientName(found.company_name);
                        }
                        if (found && found.demo_url && !renDomainOrService.trim()) {
                          setRenDomainOrService(found.demo_url.replace(/^https?:\/\//, ''));
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">-- Escribir cliente manualmente --</option>
                      <option value="__create__" className="text-cyan-400 font-semibold">+ Crear nuevo cliente aquí...</option>
                      {prospects.map((pr) => (
                        <option key={pr.id} value={pr.id}>
                          {pr.company_name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        autoFocus
                        value={quickClientNameInRen}
                        onChange={(e) => setQuickClientNameInRen(e.target.value)}
                        placeholder="Nombre del nuevo cliente"
                        className="flex-1 px-3 py-2 rounded-xl bg-obsidian-bg border border-cyan-500 text-white focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={creatingQuickClientInRen || !quickClientNameInRen.trim()}
                        onClick={handleQuickCreateClientInRen}
                        className="px-2.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold disabled:opacity-50"
                      >
                        {creatingQuickClientInRen ? '...' : 'Crear'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowQuickClientInRen(false);
                          setQuickClientNameInRen('');
                        }}
                        className="p-2 text-obsidian-muted hover:text-white rounded-xl bg-obsidian-surface"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-obsidian-text font-medium mb-1">
                    Cliente o Proyecto *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={180}
                    value={renClientName}
                    onChange={(e) => setRenClientName(e.target.value)}
                    placeholder="Ej. Clínica Dental Sonrisa"
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-obsidian-text font-medium mb-1">
                    Dominio o Servicio *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={255}
                    value={renDomainOrService}
                    onChange={(e) => setRenDomainOrService(e.target.value)}
                    placeholder="Ej. clinicasonrisa.com.mx"
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-obsidian-text font-medium mb-1">
                    Ámbito (Personal vs Empresa) *
                  </label>
                  <select
                    value={renScope}
                    onChange={(e) => setRenScope(e.target.value as EntityScope)}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="business">Empresa / Negocio</option>
                    <option value="personal">Personal</option>
                    <option value="shared">Compartido</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-obsidian-text font-medium mb-1">
                    Tipo de Servicio
                  </label>
                  <select
                    value={renServiceType}
                    onChange={(e) => setRenServiceType(e.target.value as RenewalServiceType)}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
                  >
                    {RENEWAL_SERVICE_TYPES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-obsidian-text font-medium mb-1">
                    Proveedor (Dónde está contratado)
                  </label>
                  <input
                    type="text"
                    maxLength={128}
                    value={renProvider}
                    onChange={(e) => setRenProvider(e.target.value)}
                    placeholder="Hostinger, Namecheap, Cloudflare..."
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-obsidian-text font-medium mb-1">
                    Fecha de Vencimiento *
                  </label>
                  <input
                    type="date"
                    required
                    value={renDate}
                    onChange={(e) => setRenDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-obsidian-text font-medium mb-1">Costo Renovación</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={renCost}
                    onChange={(e) => setRenCost(e.target.value)}
                    placeholder="350"
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-obsidian-text font-medium mb-1">Moneda</label>
                  <select
                    value={renCurrency}
                    onChange={(e) => setRenCurrency(e.target.value as 'MXN' | 'USD')}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-mono focus:outline-none focus:border-indigo-500"
                  >
                    <option value="MXN">MXN</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-obsidian-text font-medium mb-1.5">
                  ¿Quién cubre el pago de la renovación? *
                </label>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setRenPaidBy('client')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      renPaidBy === 'client'
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200 font-semibold'
                        : 'bg-obsidian-bg border-obsidian-border text-obsidian-muted hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Check size={13} className={renPaidBy === 'client' ? 'text-emerald-400' : 'opacity-0'} />
                      <span>Por cuenta del cliente</span>
                    </div>
                    <span className="text-[10px] text-obsidian-muted block mt-0.5">
                      El cliente lo paga o se lo cobro
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRenPaidBy('me')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      renPaidBy === 'me'
                        ? 'bg-rose-500/15 border-rose-500/40 text-rose-200 font-semibold'
                        : 'bg-obsidian-bg border-obsidian-border text-obsidian-muted hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Check size={13} className={renPaidBy === 'me' ? 'text-rose-400' : 'opacity-0'} />
                      <span>Por mi cuenta</span>
                    </div>
                    <span className="text-[10px] text-obsidian-muted block mt-0.5">
                      Sale de mi bolsillo (gasto propio)
                    </span>
                  </button>
                </div>
              </div>

              {renPaidBy === 'client' && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-1.5">
                  <label className="block text-emerald-300 font-semibold text-[11px]">
                    Monto cobrado al cliente (si se lo revendes o cobras comisión)
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-white/60 font-mono">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={renClientCharge}
                      onChange={(e) => setRenClientCharge(e.target.value)}
                      placeholder={renCost || '500'}
                      className="w-36 px-2.5 py-1.5 rounded-lg bg-obsidian-bg border border-emerald-500/40 text-white font-mono focus:outline-none focus:border-emerald-400"
                    />
                    <span className="text-emerald-300 font-mono font-semibold">{renCurrency}</span>
                    {renCost && renClientCharge && parseFloat(renClientCharge) > parseFloat(renCost) && (
                      <span className="text-[10px] font-mono text-emerald-400 ml-auto">
                        Margen: +${formatMoney(parseFloat(renClientCharge) - parseFloat(renCost))} {renCurrency}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-obsidian-text font-medium mb-1">
                  Notas Privadas (Se guardan encriptadas)
                </label>
                <textarea
                  rows={2}
                  maxLength={INPUT_LIMITS.NOTES}
                  value={renNotes}
                  onChange={(e) => setRenNotes(e.target.value)}
                  placeholder="Con qué correo está registrado, DNS, recordatorio de cobro..."
                  className="w-full p-2.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="pt-3 border-t border-obsidian-border flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsRenewalModalOpen(false)}
                  className="px-4 py-2 text-obsidian-muted hover:text-white font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingRenewal}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-md shadow-indigo-600/20 disabled:opacity-50"
                >
                  {savingRenewal ? 'Guardando...' : editingRenewal ? 'Guardar Cambios' : 'Registrar Vencimiento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL ATÓMICO: CONFIRMAR RENOVACIÓN DE CICLO (+1 CICLO)               */}
      {/* ===================================================================== */}
      {advanceRenewalTarget && (
        <div className="responsive-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div
            className="relative w-full max-w-md bg-obsidian-panel border border-emerald-500/40 rounded-2xl shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-obsidian-border">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                  <RefreshCw size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Renovar Ciclo (+1 Ciclo)</h3>
                  <p className="text-[11px] text-obsidian-muted">{advanceRenewalTarget.domain_or_service}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAdvanceRenewalTarget(null)}
                className="p-1.5 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-obsidian-bg/80 border border-obsidian-border space-y-1">
                <div className="flex justify-between">
                  <span className="text-obsidian-muted">Cliente:</span>
                  <strong className="text-white">{advanceRenewalTarget.client_name}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-obsidian-muted">Costo de renovación propio:</span>
                  <span className="font-mono text-white">${formatMoney(advanceRenewalTarget.renewal_cost)} {advanceRenewalTarget.currency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-obsidian-muted">Periodo:</span>
                  <span className="capitalize text-white/80">{advanceRenewalTarget.billing_cycle === 'monthly' ? 'Mensual (+1 mes)' : 'Anual (+1 año)'}</span>
                </div>
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 cursor-pointer">
                <input
                  type="checkbox"
                  checked={advanceCreateIncome}
                  onChange={(e) => setAdvanceCreateIncome(e.target.checked)}
                  className="mt-0.5 rounded bg-obsidian-bg border-obsidian-border text-emerald-500 focus:ring-0"
                />
                <div className="min-w-0">
                  <span className="text-emerald-200 font-semibold block">Generar registro automático en Ingresos</span>
                  <span className="text-[10px] text-obsidian-muted block mt-0.5">
                    Crea atómicamente el cobro cobrado a este cliente y calcula tu ganancia neta.
                  </span>
                </div>
              </label>

              {advanceCreateIncome && (
                <div className="space-y-2">
                  <label className="block text-obsidian-text font-medium">
                    Monto cobrado al cliente *
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-white/60">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      autoFocus
                      required
                      value={advanceChargedAmount}
                      onChange={(e) => setAdvanceChargedAmount(e.target.value)}
                      placeholder="0.00"
                      className="flex-1 px-3 py-2 rounded-xl bg-obsidian-bg border border-emerald-500/40 text-white font-mono focus:outline-none focus:border-emerald-400"
                    />
                    <span className="font-mono text-emerald-300 font-semibold">{advanceRenewalTarget.currency}</span>
                  </div>

                  {parseFloat(advanceChargedAmount || '0') > 0 && (
                    <div className="p-2.5 rounded-lg bg-obsidian-surface border border-obsidian-border flex items-center justify-between font-mono text-[11px]">
                      <span className="text-obsidian-muted">Margen de ganancia:</span>
                      <strong className={`font-bold ${parseFloat(advanceChargedAmount || '0') >= advanceRenewalTarget.renewal_cost ? 'text-emerald-400' : 'text-rose-400'}`}>
                        ${formatMoney(parseFloat(advanceChargedAmount || '0') - advanceRenewalTarget.renewal_cost)} {advanceRenewalTarget.currency}
                      </strong>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-obsidian-border flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setAdvanceRenewalTarget(null)}
                className="px-4 py-2 text-obsidian-muted hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={advancingRenewal}
                onClick={handleConfirmAdvanceRenewal}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-md shadow-emerald-600/20 disabled:opacity-50"
              >
                {advancingRenewal ? 'Renovando...' : 'Confirmar y Renovar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: REGISTRAR / EDITAR GASTO ÚNICO VARIABLE                        */}
      {/* ===================================================================== */}
      {isExpenseModalOpen && (
        <div className="responsive-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div
            className="relative w-full max-w-lg bg-obsidian-panel border border-obsidian-borderLight rounded-2xl shadow-2xl p-6 overflow-y-auto max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-obsidian-border">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 shrink-0">
                  <Receipt size={18} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white truncate">
                    {editingExpense ? 'Editar Gasto Único' : 'Registrar Gasto Único / Compra Variable'}
                  </h3>
                  <p className="text-[11px] text-obsidian-muted truncate">
                    Compras de una sola vez: hardware, licencias, cursos o insumos
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsExpenseModalOpen(false)}
                className="p-1.5 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="space-y-4 pt-4 text-xs">
              <div>
                <label className="block text-obsidian-text font-medium mb-1">
                  Título o Concepto del Gasto *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={180}
                  value={expTitle}
                  onChange={(e) => setExpTitle(e.target.value)}
                  placeholder="Ej. MacBook Pro M3, Licencia vitalicia JetBrains, Impresora..."
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-obsidian-text font-medium mb-1">Categoría *</label>
                  <select
                    value={expCategory}
                    onChange={(e) => setExpCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
                  >
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-obsidian-text font-medium mb-1">
                    Ámbito (Personal vs Empresa) *
                  </label>
                  <select
                    value={expScope}
                    onChange={(e) => setExpScope(e.target.value as EntityScope)}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="business">Empresa / Negocio</option>
                    <option value="personal">Personal</option>
                    <option value="shared">Compartido</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-obsidian-text font-medium mb-1">Monto *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                    placeholder="1200"
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-obsidian-text font-medium mb-1">Moneda</label>
                  <select
                    value={expCurrency}
                    onChange={(e) => setExpCurrency(e.target.value as 'MXN' | 'USD')}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-mono focus:outline-none focus:border-indigo-500"
                  >
                    <option value="MXN">MXN</option>
                    <option value="USD">USD</option>
                  </select>
                </div>

                <div>
                  <label className="block text-obsidian-text font-medium mb-1">Fecha</label>
                  <input
                    type="date"
                    required
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-obsidian-text font-medium mb-1">
                  Medio o Tarjeta de Pago
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={expPaymentMethodId}
                    onChange={(e) => {
                      const pid = e.target.value;
                      setExpPaymentMethodId(pid);
                      const found = paymentMethods.find((p) => p.id === pid);
                      if (found) {
                        setExpPaymentMethodLabel(`${found.alias} (*${found.last_four})`);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">-- Seleccionar tarjeta registrada --</option>
                    {paymentMethods.map((pm) => (
                      <option key={pm.id} value={pm.id}>
                        {pm.alias} (*{pm.last_four})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    maxLength={64}
                    value={expPaymentMethodLabel}
                    onChange={(e) => setExpPaymentMethodLabel(e.target.value)}
                    placeholder="O escribir: SPEI, Efectivo, BBVA..."
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-obsidian-text font-medium mb-1">
                  Notas Privadas (Se guardan encriptadas)
                </label>
                <textarea
                  rows={2}
                  maxLength={INPUT_LIMITS.NOTES}
                  value={expNotes}
                  onChange={(e) => setExpNotes(e.target.value)}
                  placeholder="Número de factura, proveedor, garantía..."
                  className="w-full p-2.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="pt-3 border-t border-obsidian-border flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="px-4 py-2 text-obsidian-muted hover:text-white font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingExpense}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold shadow-md shadow-purple-600/20 disabled:opacity-50"
                >
                  {savingExpense ? 'Guardando...' : editingExpense ? 'Guardar Cambios' : 'Registrar Gasto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
