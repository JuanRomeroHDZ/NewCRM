import React, { useState, useEffect, useCallback } from 'react';
import { DollarSign, Globe, Plus } from 'lucide-react';
import { useVault } from '../../../context/VaultContext';
import { api } from '../../../lib/api';
import { INPUT_LIMITS, isValidCalendarDate } from '../../../lib/validation';
import type { ClientIncome, DomainRenewal, Prospect } from '../../../types';

interface InspectorFinanceFormsProps {
  prospect: Prospect;
  clientIncomes: ClientIncome[];
  clientRenewals: DomainRenewal[];
  onIncomeCreated: (income: ClientIncome) => void;
  onRenewalCreated: (renewal: DomainRenewal) => void;
  onRenewalUpdated: (renewal: DomainRenewal) => void;
}

const INCOME_CATEGORY_OPTIONS = [
  { value: 'anticipo', label: 'Anticipo' },
  { value: 'liquidacion', label: 'Liquidación' },
  { value: 'iguala_mensual', label: 'Iguala Mensual' },
  { value: 'dominio_hosting', label: 'Dominio / Hosting' },
  { value: 'otro', label: 'Otro' },
];

const RENEWAL_SERVICE_OPTIONS = [
  { value: 'dominio', label: 'Dominio' },
  { value: 'hosting', label: 'Hosting' },
  { value: 'dominio_y_hosting', label: 'Dominio + Hosting' },
  { value: 'ssl_otro', label: 'SSL / Otro' },
];

function getIncomeCategoryLabel(category: string): string {
  if (category === 'renovacion_dominio_hosting' || category === 'dominio_hosting') {
    return 'Dominio / Hosting';
  }
  const found = INCOME_CATEGORY_OPTIONS.find((item) => item.value === category);
  return found ? found.label : category;
}

export const InspectorFinanceForms: React.FC<InspectorFinanceFormsProps> = ({
  prospect,
  clientIncomes,
  clientRenewals,
  onIncomeCreated,
  onRenewalCreated,
  onRenewalUpdated,
}) => {
  const {
    supportedCurrencies,
    baseCurrency,
    systemLocale,
    exchangeRate,
    showToast,
    triggerDataReload,
  } = useVault();

  const [showAddIncome, setShowAddIncome] = useState(false);
  const [incConcept, setIncConcept] = useState('');
  const [incAmount, setIncAmount] = useState('');
  const [incCurrency, setIncCurrency] = useState<string>(baseCurrency);
  const [incCategory, setIncCategory] = useState('anticipo');
  const [incStatus, setIncStatus] = useState<'cobrado' | 'pendiente'>('cobrado');
  const [incDate, setIncDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [incRecurring, setIncRecurring] = useState(false);
  const [incLoading, setIncLoading] = useState(false);

  const [showAddDomain, setShowAddDomain] = useState(false);
  const [domName, setDomName] = useState('');
  const [domType, setDomType] = useState('dominio');
  const [domProvider, setDomProvider] = useState('');
  const [domCost, setDomCost] = useState('');
  const [domCharge, setDomCharge] = useState('');
  const [domCurrency, setDomCurrency] = useState<string>(baseCurrency);
  const [domCycle] = useState<'yearly' | 'monthly'>('yearly');
  const [domPaidBy, setDomPaidBy] = useState<'me' | 'client'>('client');
  const [domDate, setDomDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split('T')[0];
  });
  const [domLoading, setDomLoading] = useState(false);

  useEffect(() => {
    setIncCurrency(baseCurrency);
    setDomCurrency(baseCurrency);
  }, [baseCurrency, prospect.id]);

  const getCurrencySymbol = useCallback(
    (code?: string) => supportedCurrencies.find((c) => c.code === code)?.symbol || '$',
    [supportedCurrencies]
  );

  const formatAmount = useCallback(
    (amount: number, currencyCode?: string) => {
      const code = currencyCode || baseCurrency;
      const symbol = getCurrencySymbol(code);
      const formatted = Number(amount || 0).toLocaleString(systemLocale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      return `${symbol}${formatted} ${code}`;
    },
    [baseCurrency, getCurrencySymbol, systemLocale]
  );

  const convertToBaseCurrency = useCallback(
    (amount: number, currencyCode: string): number | null => {
      if (!currencyCode || currencyCode === baseCurrency) return amount;
      if (!exchangeRate || exchangeRate.rate <= 0) return null;
      if (
        currencyCode === exchangeRate.base_currency &&
        baseCurrency === exchangeRate.target_currency
      ) {
        return amount * exchangeRate.rate;
      }
      if (
        currencyCode === exchangeRate.target_currency &&
        baseCurrency === exchangeRate.base_currency
      ) {
        return amount / exchangeRate.rate;
      }
      return null;
    },
    [baseCurrency, exchangeRate]
  );

  const sumByStatus = (status: 'cobrado' | 'pendiente'): number | null => {
    const incomes = clientIncomes.filter((i) => i.status === status);
    let total = 0;
    for (const item of incomes) {
      const converted = convertToBaseCurrency(item.amount, item.currency);
      if (converted === null) return null;
      total += converted;
    }
    return total;
  };

  const totalCobrado = sumByStatus('cobrado');
  const totalPendiente = sumByStatus('pendiente');

  const handleCreateIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incConcept.trim()) {
      showToast('El concepto del pago es obligatorio.', 'warning');
      return;
    }
    const amountVal = Number(incAmount);
    if (!Number.isFinite(amountVal) || amountVal <= 0 || amountVal > INPUT_LIMITS.COST_AMOUNT) {
      showToast(`Ingresa un monto entre 0.01 y ${INPUT_LIMITS.COST_AMOUNT.toLocaleString(systemLocale)}.`, 'warning');
      return;
    }
    if (!isValidCalendarDate(incDate)) {
      showToast('Selecciona una fecha de pago válida.', 'warning');
      return;
    }
    setIncLoading(true);
    try {
      const created = await api.createIncome({
        prospect_id: prospect.id,
        client_name: prospect.company_name,
        concept: incConcept.trim(),
        category: incCategory,
        amount: amountVal,
        currency: incCurrency,
        status: incStatus,
        received_date: incDate,
        is_recurring: incRecurring,
        scope: prospect.scope || 'business',
      });
      onIncomeCreated(created);
      setShowAddIncome(false);
      setIncConcept('');
      setIncAmount('');
      showToast('Pago registrado correctamente para este cliente.', 'success');
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message || 'Error al registrar el pago.', 'error');
    } finally {
      setIncLoading(false);
    }
  };

  const handleCreateRenewal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domName.trim()) {
      showToast('El nombre del dominio o servicio es obligatorio.', 'warning');
      return;
    }
    const costVal = domCost.trim() ? Number(domCost) : 0;
    const chargeVal = domCharge.trim() ? Number(domCharge) : 0;
    if (!Number.isFinite(costVal) || costVal < 0 || costVal > INPUT_LIMITS.COST_AMOUNT) {
      showToast(`El costo debe estar entre 0 y ${INPUT_LIMITS.COST_AMOUNT.toLocaleString(systemLocale)}.`, 'warning');
      return;
    }
    if (!Number.isFinite(chargeVal) || chargeVal < 0 || chargeVal > INPUT_LIMITS.COST_AMOUNT) {
      showToast(`El cobro debe estar entre 0 y ${INPUT_LIMITS.COST_AMOUNT.toLocaleString(systemLocale)}.`, 'warning');
      return;
    }
    if (!isValidCalendarDate(domDate)) {
      showToast('Selecciona una fecha de vencimiento válida.', 'warning');
      return;
    }
    setDomLoading(true);
    try {
      const created = await api.createRenewal({
        prospect_id: prospect.id,
        client_name: prospect.company_name,
        domain_or_service: domName.trim(),
        service_type: domType,
        provider: domProvider.trim() || null,
        renewal_cost: costVal,
        client_charge_amount: chargeVal,
        currency: domCurrency,
        billing_cycle: domCycle,
        paid_by: domPaidBy,
        renewal_date: domDate,
        scope: prospect.scope || 'business',
      });
      onRenewalCreated(created);
      setShowAddDomain(false);
      setDomName('');
      setDomCost('');
      setDomCharge('');
      setDomProvider('');
      showToast('Vencimiento de dominio/hosting asociado con éxito.', 'success');
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message || 'Error al asociar vencimiento.', 'error');
    } finally {
      setDomLoading(false);
    }
  };

  const handleAdvanceRenewal = async (renId: string) => {
    try {
      const updated = await api.advanceRenewalCycle(renId);
      onRenewalUpdated(updated);
      showToast(`Ciclo avanzado (+1 año). Próximo vencimiento: ${updated.renewal_date}`, 'success');
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message || 'Error al renovar ciclo.', 'error');
    }
  };

  return (
    <>
      {/* HISTORIAL FINANCIERO / PAGOS DE ESTE CLIENTE */}
      <div className="space-y-2 rounded-xl border border-obsidian-border bg-obsidian-surface p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <DollarSign size={14} className="text-emerald-400" aria-hidden="true" />
            <span className="text-xs font-semibold text-white">Pagos del cliente</span>
          </div>
          <button
            type="button"
            onClick={() => setShowAddIncome(!showAddIncome)}
            aria-expanded={showAddIncome}
            className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/20"
          >
            <Plus size={12} aria-hidden="true" />
            <span>{showAddIncome ? 'Cerrar' : 'Registrar Pago'}</span>
          </button>
        </div>

        {/* Summary Metrics */}
        <div className="grid grid-cols-2 gap-2">
          <div className="min-w-0 border-l border-obsidian-border pl-2">
            <span className="block text-[10px] text-obsidian-muted">Cobrado</span>
            <span className="font-mono text-xs font-bold text-emerald-400">
              {totalCobrado === null ? 'Sin tipo de cambio' : formatAmount(totalCobrado, baseCurrency)}
            </span>
          </div>
          <div className="min-w-0 border-l border-obsidian-border pl-2">
            <span className="block text-[10px] text-obsidian-muted">Pendiente</span>
            <span className="font-mono text-xs font-bold text-amber-400">
              {totalPendiente === null ? 'Sin tipo de cambio' : formatAmount(totalPendiente, baseCurrency)}
            </span>
          </div>
        </div>

        {/* Quick Add Income Form */}
        {showAddIncome && (
          <form onSubmit={handleCreateIncome} className="space-y-2 rounded-lg border border-emerald-500/40 bg-obsidian-bg p-2.5">
            <span className="block text-[11px] font-semibold text-white">Nuevo Pago Recibido:</span>
            <input
              type="text"
              required
              maxLength={INPUT_LIMITS.NAME}
              value={incConcept}
              onChange={(e) => setIncConcept(e.target.value)}
              placeholder="Concepto (ej. Anticipo 50% Página Web)"
              aria-label="Concepto del pago"
              className="w-full rounded border border-obsidian-border bg-obsidian-surface px-2.5 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
            />
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={INPUT_LIMITS.COST_AMOUNT}
                required
                value={incAmount}
                onChange={(e) => setIncAmount(e.target.value)}
                placeholder="Monto"
                aria-label="Monto del pago"
                className="rounded border border-obsidian-border bg-obsidian-surface px-2.5 py-1.5 font-mono text-xs text-white focus:border-emerald-500 focus:outline-none"
              />
              <select
                value={incCurrency}
                onChange={(e) => setIncCurrency(e.target.value)}
                aria-label="Moneda del pago"
                className="rounded border border-obsidian-border bg-obsidian-surface px-2 py-1.5 text-xs text-white"
              >
                {supportedCurrencies.map((curr) => (
                  <option key={curr.code} value={curr.code}>
                    {curr.code}
                  </option>
                ))}
              </select>
              <select
                value={incStatus}
                onChange={(e) => setIncStatus(e.target.value as 'cobrado' | 'pendiente')}
                aria-label="Estado del pago"
                className="rounded border border-obsidian-border bg-obsidian-surface px-2 py-1.5 text-xs text-white"
              >
                <option value="cobrado">Cobrado</option>
                <option value="pendiente">Pendiente</option>
              </select>
            </div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              <select
                value={incCategory}
                onChange={(e) => setIncCategory(e.target.value)}
                aria-label="Categoría del pago"
                className="rounded border border-obsidian-border bg-obsidian-surface px-2 py-1.5 text-xs text-white"
              >
                {INCOME_CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <input
                type="date"
                required
                value={incDate}
                onChange={(e) => setIncDate(e.target.value)}
                aria-label="Fecha del pago"
                className="rounded border border-obsidian-border bg-obsidian-surface px-2 py-1.5 font-mono text-xs text-white"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <label className="inline-flex items-center gap-1.5 text-[11px] text-obsidian-muted">
                <input
                  type="checkbox"
                  checked={incRecurring}
                  onChange={(e) => setIncRecurring(e.target.checked)}
                />
                <span>Es cobro recurrente (Iguala)</span>
              </label>
              <button
                type="submit"
                disabled={incLoading}
                className="min-h-[34px] rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {incLoading ? 'Guardando...' : 'Guardar Pago'}
              </button>
            </div>
          </form>
        )}

        {/* Incomes List */}
        <div className="max-h-48 space-y-1.5 overflow-y-auto">
          {clientIncomes.length === 0 ? (
            <div className="py-1 text-[11px] text-obsidian-muted">
              Sin pagos registrados para este cliente.
            </div>
          ) : (
            clientIncomes.map((inc) => (
              <div
                key={inc.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-obsidian-border bg-obsidian-bg p-2"
              >
                <div className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-white">{inc.concept}</span>
                  <span className="font-mono text-[10px] text-obsidian-muted">
                    {inc.received_date} • {getIncomeCategoryLabel(inc.category)}
                  </span>
                </div>
                <div className="shrink-0 text-right">
                  <span
                    className={`block font-mono text-xs font-bold ${
                      inc.status === 'cobrado' ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {formatAmount(inc.amount, inc.currency)}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                      inc.status === 'cobrado'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {inc.status === 'cobrado' ? 'Cobrado' : 'Pendiente'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* DOMINIOS Y HOSTING ASOCIADOS */}
      <div className="space-y-2 rounded-xl border border-obsidian-border bg-obsidian-surface p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Globe size={14} className="text-indigo-400" aria-hidden="true" />
            <span className="text-xs font-semibold text-white">Dominios y Hosting Asociados</span>
          </div>
          <button
            type="button"
            onClick={() => setShowAddDomain(!showAddDomain)}
            aria-expanded={showAddDomain}
            className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-semibold text-indigo-300 hover:bg-indigo-500/20"
          >
            <Plus size={12} aria-hidden="true" />
            <span>{showAddDomain ? 'Cerrar' : 'Asociar'}</span>
          </button>
        </div>

        {/* Quick Add Domain Form */}
        {showAddDomain && (
          <form onSubmit={handleCreateRenewal} className="space-y-2 rounded-lg border border-indigo-500/40 bg-obsidian-bg p-2.5">
            <span className="block text-[11px] font-semibold text-white">Asociar Dominio o Hosting:</span>
            <input
              type="text"
              required
              maxLength={INPUT_LIMITS.URL}
              value={domName}
              onChange={(e) => setDomName(e.target.value)}
              placeholder="Dominio o Servicio (ej. www.cliente.com)"
              aria-label="Nombre del dominio o servicio"
              className="w-full rounded border border-obsidian-border bg-obsidian-surface px-2.5 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
            />
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              <select
                value={domType}
                onChange={(e) => setDomType(e.target.value)}
                aria-label="Tipo de servicio"
                className="rounded border border-obsidian-border bg-obsidian-surface px-2 py-1.5 text-xs text-white"
              >
                {RENEWAL_SERVICE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                maxLength={INPUT_LIMITS.PLATFORM_NAME}
                value={domProvider}
                onChange={(e) => setDomProvider(e.target.value)}
                placeholder="Proveedor (ej. Namecheap)"
                aria-label="Proveedor del servicio"
                className="rounded border border-obsidian-border bg-obsidian-surface px-2.5 py-1.5 text-xs text-white"
              />
            </div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
              <input
                type="number"
                step="0.01"
                min="0"
                max={INPUT_LIMITS.COST_AMOUNT}
                value={domCost}
                onChange={(e) => setDomCost(e.target.value)}
                placeholder="Costo base"
                aria-label="Costo base de renovación"
                className="rounded border border-obsidian-border bg-obsidian-surface px-2.5 py-1.5 font-mono text-xs text-white"
              />
              <input
                type="number"
                step="0.01"
                min="0"
                max={INPUT_LIMITS.COST_AMOUNT}
                value={domCharge}
                onChange={(e) => setDomCharge(e.target.value)}
                placeholder="Cobro cliente"
                aria-label="Cobro al cliente"
                className="rounded border border-obsidian-border bg-obsidian-surface px-2.5 py-1.5 font-mono text-xs text-white"
              />
              <select
                value={domCurrency}
                onChange={(e) => setDomCurrency(e.target.value)}
                aria-label="Moneda de renovación"
                className="rounded border border-obsidian-border bg-obsidian-surface px-2 py-1.5 text-xs text-white"
              >
                {supportedCurrencies.map((curr) => (
                  <option key={curr.code} value={curr.code}>
                    {curr.code}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
              <select
                value={domPaidBy}
                onChange={(e) => setDomPaidBy(e.target.value as 'me' | 'client')}
                aria-label="Responsable del pago"
                className="rounded border border-obsidian-border bg-obsidian-surface px-2 py-1.5 text-xs text-white"
              >
                <option value="client">Por cuenta del cliente</option>
                <option value="me">Por mi cuenta</option>
              </select>
              <input
                type="date"
                required
                value={domDate}
                onChange={(e) => setDomDate(e.target.value)}
                aria-label="Fecha de renovación"
                className="rounded border border-obsidian-border bg-obsidian-surface px-2 py-1.5 font-mono text-xs text-white"
              />
              <button
                type="submit"
                disabled={domLoading}
                className="min-h-[34px] rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {domLoading ? 'Guardando...' : 'Asociar'}
              </button>
            </div>
          </form>
        )}

        {/* Domain Renewals List */}
        <div className="max-h-48 space-y-1.5 overflow-y-auto">
          {clientRenewals.length === 0 ? (
            <div className="py-1 text-[11px] text-obsidian-muted">
              Sin dominios ni hosting asociados a este cliente.
            </div>
          ) : (
            clientRenewals.map((ren) => (
              <div
                key={ren.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-obsidian-border bg-obsidian-bg p-2.5"
              >
                <div className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-white">{ren.domain_or_service}</span>
                  <span className="block truncate text-[10px] text-obsidian-muted">
                    {ren.service_type} • Vence: <span className="font-mono text-white">{ren.renewal_date}</span>
                  </span>
                  <span className="text-[9px] text-obsidian-muted">
                    {ren.paid_by === 'me' ? 'Por mi cuenta' : 'Por cuenta del cliente'} • Costo:{' '}
                    {formatAmount(ren.renewal_cost, ren.currency)}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                      ren.days_remaining < 0 || ren.expiry_semaphore === 'vencido'
                        ? 'bg-rose-500/20 text-rose-300'
                        : ren.days_remaining <= 7 || ren.expiry_semaphore === 'urgente'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-emerald-500/20 text-emerald-300'
                    }`}
                  >
                    {ren.days_remaining < 0
                      ? `Vencido (${Math.abs(ren.days_remaining)}d)`
                      : `${ren.days_remaining} días restantes`}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleAdvanceRenewal(ren.id)}
                    className="min-h-[28px] rounded border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-300 hover:bg-indigo-500/20"
                    title="Avanzar 1 ciclo de renovación"
                  >
                    +1 ciclo
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
};
