import React, { useState, useEffect } from 'react';
import { 
  CreditCard, Plus, DollarSign, Calendar, RefreshCw, 
  Lock, ArrowRight, Check, AlertCircle, Edit2 
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { PaymentMethod, PlatformAccount } from '../../types';
import { PlatformIcon } from '../common/PlatformIcon';
import { SecretField } from '../common/SecretField';

export const SubscriptionsView: React.FC = () => {
  const { 
    isUnlocked, openUnlockModal, openPaymentModal, 
    openInspector, exchangeRate, refreshExchangeRate, 
    showToast, dataVersion 
  } = useVault();

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [platforms, setPlatforms] = useState<PlatformAccount[]>([]);
  const [manualRateInput, setManualRateInput] = useState<string>('');
  const [isEditingRate, setIsEditingRate] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getPaymentMethods(),
      api.getPlatforms()
    ]).then(([payList, platList]) => {
      setPaymentMethods(payList);
      setPlatforms(platList);
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
      showToast('Introduce un tipo de cambio válido.', 'error');
      return;
    }
    if (!isUnlocked) {
      openUnlockModal();
      return;
    }

    try {
      await api.setManualExchangeRate(rateNum, true);
      await refreshExchangeRate();
      setIsEditingRate(false);
      showToast(`Tipo de cambio manual fijado a $${rateNum.toFixed(2)} MXN`, 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleSyncOfficialRate = async () => {
    if (!isUnlocked) {
      openUnlockModal();
      return;
    }
    try {
      await api.syncExchangeRate();
      await refreshExchangeRate();
      showToast('Tasa de cambio sincronizada automáticamente.', 'success');
    } catch (err: any) {
      showToast('Error al conectar con el servidor de divisas.', 'error');
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fadeIn">
      {/* Header and Add Card button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
            <CreditCard className="text-indigo-400" size={18} />
            <span>Suscripciones, Métodos de Pago & Divisas</span>
          </h2>
          <p className="text-xs text-obsidian-muted">
            Control de cargos recurrentes domiciliados, billeteras digitales y tipo de cambio oficial
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (!isUnlocked) {
              openUnlockModal();
            } else {
              openPaymentModal();
            }
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all whitespace-nowrap"
        >
          <Plus size={14} />
          <span>Nuevo Método de Pago</span>
        </button>
      </div>

      {/* Exchange Rate Converter Widget */}
      <div className="p-5 rounded-2xl bg-obsidian-panel border border-obsidian-border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <DollarSign size={20} />
          </div>
          <div>
            <div className="text-xs font-semibold text-white flex items-center gap-2">
              <span>Módulo de Conversión de Divisas (USD a MXN)</span>
              {exchangeRate?.is_manual ? (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  Fijado Manualmente
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Sincronizado Oficial
                </span>
              )}
            </div>
            <p className="text-[11px] text-obsidian-muted mt-0.5">
              Tasa utilizada para consolidar tus métricas y alertas financieras en tiempo real
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {isEditingRate ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                value={manualRateInput}
                onChange={(e) => setManualRateInput(e.target.value)}
                className="w-28 px-3 py-1.5 rounded-xl bg-obsidian-bg border border-indigo-500 text-xs font-mono text-white focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSaveManualRate}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500"
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={() => setIsEditingRate(false)}
                className="px-2.5 py-1.5 rounded-xl bg-obsidian-surface text-obsidian-muted text-xs hover:text-white"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="px-3.5 py-1.5 rounded-xl bg-obsidian-surface border border-obsidian-border font-mono text-sm text-white font-bold">
                $1 USD = ${exchangeRate?.rate.toFixed(2)} MXN
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isUnlocked) openUnlockModal();
                  else setIsEditingRate(true);
                }}
                title="Fijar valor manual"
                className="p-2 text-obsidian-muted hover:text-white rounded-xl hover:bg-obsidian-surface border border-obsidian-border transition-colors"
              >
                <Edit2 size={14} />
              </button>
              <button
                type="button"
                onClick={handleSyncOfficialRate}
                title="Sincronizar tasa de cambio oficial"
                className="p-2 text-obsidian-muted hover:text-white rounded-xl hover:bg-obsidian-surface border border-obsidian-border transition-colors"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Payment Cards Grid */}
      <div>
        <h3 className="text-sm font-bold text-white mb-3 tracking-tight">
          Tarjetas & Billeteras Registradas ({paymentMethods.length})
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {paymentMethods.map((pay) => {
            // Find subscriptions tied to this card
            const linked = platforms.filter((p) => p.payment_method_id === pay.id);

            return (
              <div
                key={pay.id}
                className="p-5 rounded-2xl bg-gradient-to-br from-obsidian-panel to-obsidian-card border border-obsidian-border hover:border-obsidian-borderLight transition-all space-y-4 shadow-xl"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-bold text-white text-sm block">{pay.alias}</span>
                    <span className="text-[11px] text-obsidian-muted">{pay.issuer}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-obsidian-surface border border-obsidian-border text-white font-mono text-xs font-bold">
                    *{pay.last_four}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-obsidian-surface/60 border border-obsidian-border text-xs space-y-1">
                  <div className="text-obsidian-muted text-[10px]">Número de Tarjeta</div>
                  <SecretField
                    value={pay.card_number_plain}
                    masked={pay.card_number_masked}
                    label={`Tarjeta ${pay.alias}`}
                  />
                  {pay.expiry_month && pay.expiry_year && (
                    <div className="text-[10px] text-obsidian-muted font-mono pt-1">
                      Expira: {pay.expiry_month}/{pay.expiry_year}
                    </div>
                  )}
                </div>

                {/* Subscriptions tied to this card */}
                <div>
                  <span className="text-[10px] text-obsidian-muted font-semibold uppercase tracking-wider block mb-1.5">
                    Suscripciones Domiciliadas ({linked.length})
                  </span>
                  <div className="space-y-1">
                    {linked.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => openInspector('platform', item.id)}
                        className="flex items-center justify-between p-2 rounded-lg bg-obsidian-bg hover:bg-obsidian-surface border border-obsidian-border text-xs cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <PlatformIcon name={item.name} iconUrl={item.icon_url} size="sm" />
                          <span className="text-white font-medium">{item.name}</span>
                        </div>
                        <span className="font-mono text-emerald-400 font-semibold">
                          ${item.subscription_cost} {item.currency}
                        </span>
                      </div>
                    ))}
                    {linked.length === 0 && (
                      <div className="text-[11px] text-obsidian-muted italic">
                        Sin suscripciones domiciliadas a esta tarjeta.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Next Renewals Timeline & Trial Alerts */}
      <div className="space-y-4 pt-4 border-t border-obsidian-border">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              <Calendar className="text-cyan-400 w-4 h-4" />
              <span>Cronograma de Próximas Renovaciones & Alertas de Vencimiento</span>
            </h3>
            <p className="text-xs text-obsidian-muted">
              Previsión de flujo de caja y recordatorios de pruebas gratuitas antes del cobro automático
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {platforms
            .filter((p) => p.subscription_status === 'active' || p.subscription_status === 'free_trial' || p.subscription_cost > 0)
            .sort((a, b) => (a.next_billing_date || '9999').localeCompare(b.next_billing_date || '9999'))
            .map((p) => {
              const isTrial = p.subscription_status === 'free_trial';
              return (
                <div
                  key={p.id}
                  onClick={() => openInspector('platform', p.id)}
                  className="p-4 rounded-xl bg-obsidian-surface/60 hover:bg-obsidian-surface border border-obsidian-border hover:border-cyan-500/30 transition-all cursor-pointer space-y-2.5 group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <PlatformIcon name={p.name} iconUrl={p.icon_url} size="sm" />
                      <div>
                        <span className="font-semibold text-white text-xs block group-hover:text-cyan-300 transition-colors">
                          {p.name}
                        </span>
                        <span className="text-[10px] text-obsidian-muted capitalize">
                          Ciclo: {p.billing_cycle || 'Mensual'}
                        </span>
                      </div>
                    </div>

                    <span className="font-mono text-xs font-bold text-emerald-400">
                      ${p.subscription_cost} {p.currency}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-obsidian-border/40">
                    <span className="text-obsidian-muted flex items-center gap-1 font-mono">
                      <Calendar className="w-3 h-3 text-white/40" />
                      {p.next_billing_date ? `Próximo: ${p.next_billing_date}` : 'Sin fecha fijada'}
                    </span>

                    {isTrial ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                        Prueba Gratuita
                      </span>
                    ) : (
                      <span className="text-white/40 text-[10px] truncate max-w-[120px]">
                        {p.payment_alias || 'Sin tarjeta'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};
