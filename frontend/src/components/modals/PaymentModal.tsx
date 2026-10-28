import React, { useState, useEffect } from 'react';
import { X, CreditCard, AlertCircle, ShieldCheck } from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { isValidLastFour, isValidExpiryMonth, isValidExpiryYear, INPUT_LIMITS } from '../../lib/validation';

export const PaymentModal: React.FC = () => {
  const { isPaymentModalOpen, closePaymentModal, editingPayment, showToast, triggerDataReload } = useVault();

  const [issuer, setIssuer] = useState('MasterCard');
  const [alias, setAlias] = useState('');
  const [lastFour, setLastFour] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('12');
  const [expiryYear, setExpiryYear] = useState('28');
  const [billingNotes, setBillingNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isPaymentModalOpen) {
      setFormError(null);
      if (editingPayment) {
        setIssuer(editingPayment.issuer || 'MasterCard');
        setAlias(editingPayment.alias || '');
        setLastFour(editingPayment.last_four || '');
        setCardNumber(editingPayment.card_number_plain || '');
        setExpiryMonth(editingPayment.expiry_month || '');
        setExpiryYear(editingPayment.expiry_year || '');
        setBillingNotes(editingPayment.billing_notes || '');
      } else {
        setIssuer('MasterCard');
        setAlias('');
        setLastFour('');
        setCardNumber('');
        setExpiryMonth('12');
        setExpiryYear('28');
        setBillingNotes('');
      }
    }
  }, [isPaymentModalOpen, editingPayment]);

  if (!isPaymentModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!alias.trim()) {
      const msg = 'El alias identificador de la tarjeta o billetera es obligatorio.';
      setFormError(msg);
      showToast(msg, 'error');
      return;
    }

    if (!isValidLastFour(lastFour)) {
      const msg = 'Debes ingresar exactamente los últimos 4 dígitos numéricos de la tarjeta o cuenta.';
      setFormError(msg);
      showToast(msg, 'error');
      return;
    }

    if (expiryMonth.trim() && !isValidExpiryMonth(expiryMonth)) {
      const msg = 'El mes de expiración debe estar entre 01 y 12.';
      setFormError(msg);
      showToast(msg, 'error');
      return;
    }

    if (expiryYear.trim() && !isValidExpiryYear(expiryYear)) {
      const msg = 'El año de expiración debe tener formato numérico válido (ej. 28 o 2028).';
      setFormError(msg);
      showToast(msg, 'error');
      return;
    }

    setLoading(true);
    try {
      const payload: any = {
        issuer,
        alias: alias.trim(),
        last_four: lastFour.trim(),
        expiry_month: expiryMonth.trim() ? expiryMonth.trim().padStart(2, '0') : null,
        expiry_year: expiryYear.trim() || null,
        billing_notes: billingNotes.trim() || null
      };

      if (cardNumber.trim()) {
        payload.card_number = cardNumber.trim();
      }

      if (editingPayment) {
        await api.updatePaymentMethod(editingPayment.id, payload);
        showToast('Método de pago actualizado correctamente.', 'success');
      } else {
        await api.createPaymentMethod(payload);
        showToast('Método de pago registrado con éxito.', 'success');
      }
      closePaymentModal();
      triggerDataReload();
    } catch (err: any) {
      setFormError(err.message || 'Error al guardar el método de pago.');
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-modal-title"
    >
      <div 
        className="relative w-full max-w-lg bg-obsidian-panel border border-obsidian-borderLight rounded-2xl shadow-2xl p-6 overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b border-obsidian-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 flex-shrink-0">
              <CreditCard size={20} />
            </div>
            <div className="min-w-0">
              <h2 id="payment-modal-title" className="text-base font-bold text-white tracking-tight truncate">
                {editingPayment ? 'Editar Método de Pago o Billetera' : 'Registrar Método de Pago o Billetera'}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={closePaymentModal}
            className="p-1.5 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface flex-shrink-0"
            aria-label="Cerrar modal"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 space-y-4 text-xs pr-1">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2 text-rose-300 text-xs" role="alert">
              <AlertCircle size={15} className="text-rose-400 flex-shrink-0 mt-0.5" />
              <span className="break-words">{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="payment-issuer" className="text-obsidian-text font-medium block mb-1">
                Emisor / Entidad Financiera *
              </label>
              <select
                id="payment-issuer"
                value={issuer}
                onChange={(e) => setIssuer(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
              >
                <option value="Visa">Visa</option>
                <option value="MasterCard">MasterCard</option>
                <option value="Nu">Nu (Nubank)</option>
                <option value="Amex">American Express</option>
                <option value="PayPal">PayPal</option>
                <option value="MercadoPago">MercadoPago</option>
                <option value="ApplePay">Apple Pay</option>
                <option value="Otro">Otro Banco / Emisor</option>
              </select>
            </div>

            <div>
              <label htmlFor="payment-alias" className="text-obsidian-text font-medium block mb-1">
                Nombre o Alias Identificador *
              </label>
              <input
                id="payment-alias"
                type="text"
                required
                maxLength={INPUT_LIMITS.PAYMENT_ALIAS}
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="Ej. Débito BBVA Personal, Nu Corporativa"
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="payment-last-four" className="text-obsidian-text font-medium block mb-1">
                Últimos 4 Dígitos *
              </label>
              <input
                id="payment-last-four"
                type="text"
                required
                maxLength={INPUT_LIMITS.LAST_FOUR}
                value={lastFour}
                onChange={(e) => setLastFour(e.target.value.replace(/\D/g, ''))}
                placeholder="4821"
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono tracking-widest focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label htmlFor="payment-expiry-month" className="text-obsidian-text font-medium block mb-1">
                Fecha de Vencimiento (MM / AA)
              </label>
              <div className="flex gap-2">
                <input
                  id="payment-expiry-month"
                  type="text"
                  maxLength={INPUT_LIMITS.EXPIRY_MONTH}
                  value={expiryMonth}
                  onChange={(e) => setExpiryMonth(e.target.value.replace(/\D/g, ''))}
                  placeholder="MM"
                  aria-label="Mes de expiración"
                  className="w-1/2 px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono text-center focus:outline-none focus:border-indigo-500"
                />
                <input
                  id="payment-expiry-year"
                  type="text"
                  maxLength={INPUT_LIMITS.EXPIRY_YEAR}
                  value={expiryYear}
                  onChange={(e) => setExpiryYear(e.target.value.replace(/\D/g, ''))}
                  placeholder="AA"
                  aria-label="Año de expiración"
                  className="w-1/2 px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono text-center focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-obsidian-surface/60 border border-obsidian-border space-y-2">
            <div className="flex items-center gap-1.5 text-obsidian-muted">
              <ShieldCheck size={14} className="text-emerald-400" />
              <span className="font-semibold text-white uppercase text-[10px] tracking-wider">
                Seguridad PCI DSS — Cumplimiento Estricto
              </span>
            </div>
            <p className="text-[11px] text-obsidian-muted leading-relaxed">
              EmailSaver no almacena códigos de seguridad CVV/CVC bajo ninguna circunstancia, cumpliendo con los estándares PCI DSS. Solo se almacena el alias, emisor y los últimos 4 dígitos.
            </p>

            <div className="pt-2">
              <label htmlFor="payment-card-number" className="text-obsidian-muted block mb-1">
                Número Completo de Tarjeta (Opcional — Cifrado AES-256-GCM)
              </label>
              <input
                id="payment-card-number"
                type="password"
                maxLength={INPUT_LIMITS.CARD_NUMBER}
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                placeholder="•••• •••• •••• ••••"
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="payment-billing-notes" className="text-obsidian-text font-medium block mb-1">
              Notas de Facturación (Cifradas AES-256-GCM){' '}
              <span className="text-[10px] text-obsidian-muted font-mono">
                ({billingNotes.length}/{INPUT_LIMITS.BILLING_NOTES})
              </span>
            </label>
            <textarea
              id="payment-billing-notes"
              rows={2}
              maxLength={INPUT_LIMITS.BILLING_NOTES}
              value={billingNotes}
              onChange={(e) => setBillingNotes(e.target.value)}
              placeholder="Día de corte, límite de crédito o uso previsto..."
              className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <div className="pt-2 border-t border-obsidian-border flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={closePaymentModal}
              disabled={loading}
              className="px-4 py-2 rounded-xl border border-obsidian-border hover:bg-obsidian-surface text-obsidian-muted hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-1.5"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <span>{editingPayment ? 'Guardar Cambios' : 'Registrar Tarjeta'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
