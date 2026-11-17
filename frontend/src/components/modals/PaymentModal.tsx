import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { X, CreditCard, AlertCircle, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { useAuditedDialog } from '../common/useAuditedDialog';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { isValidLastFour, isValidExpiryMonth, isValidExpiryYear, validateCardFields, INPUT_LIMITS } from '../../lib/validation';

export const PaymentModal: React.FC = () => {
  const { isPaymentModalOpen, closePaymentModal, editingPayment, showToast, triggerDataReload } = useVault();

  const [issuer, setIssuer] = useState('MasterCard');
  const [alias, setAlias] = useState('');
  const [lastFour, setLastFour] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [showCardNumber, setShowCardNumber] = useState(false);
  const cardNumberInputRef = useRef<HTMLInputElement>(null);
  const cardCaretDigits = useRef<number | null>(null);
  const [expiryMonth, setExpiryMonth] = useState('');
  const [expiryYear, setExpiryYear] = useState('');
  const [billingNotes, setBillingNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isPaymentModalOpen) {
      setFormError(null);
      setShowCardNumber(false);
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
        setExpiryMonth('');
        setExpiryYear('');
        setBillingNotes('');
      }
    }
  }, [isPaymentModalOpen, editingPayment]);

  useLayoutEffect(() => {
    const input = cardNumberInputRef.current;
    const digitsBeforeCaret = cardCaretDigits.current;
    if (!input || digitsBeforeCaret === null) return;
    const caretPosition = digitsBeforeCaret + Math.max(0, Math.ceil(digitsBeforeCaret / 4) - 1);
    input.setSelectionRange(caretPosition, caretPosition);
    cardCaretDigits.current = null;
  }, [cardNumber]);

  const requestClose = () => { if (!loading) closePaymentModal(); };
  const dialogRef = useAuditedDialog(isPaymentModalOpen, requestClose, loading);

  if (!isPaymentModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
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

    const cardError = validateCardFields(cardNumber, lastFour, expiryMonth, expiryYear);
    if (cardError) {
      setFormError(cardError);
      showToast(cardError, 'error');
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
      className="responsive-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn"
      onClick={requestClose}
    >
      <div 
        ref={dialogRef}
        tabIndex={-1}
        aria-busy={loading}
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-modal-title"
        className="relative w-full max-w-lg bg-obsidian-panel border border-obsidian-border rounded-xl shadow-xl p-4 sm:p-6 overflow-hidden max-h-[calc(100dvh-1rem)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-obsidian-border">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <CreditCard size={18} className="shrink-0 text-obsidian-muted" aria-hidden="true" />
            <div className="min-w-0">
              <h2 id="payment-modal-title" className="text-base font-bold text-white tracking-tight break-words">
                {editingPayment ? 'Editar Método de Pago o Billetera' : 'Registrar Método de Pago o Billetera'}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="ui-action-icon flex-shrink-0"
            aria-label="Cerrar modal"
          >{/* [Icono] Acción identificada por su nombre accesible. */}
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="min-h-0 flex-1 overflow-y-auto py-4 space-y-4 text-xs pr-1">
          {formError && (
            <div className="flex items-start gap-2 rounded-lg border border-obsidian-border bg-obsidian-surface p-3 text-xs text-obsidian-muted" role="alert">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0 text-rose-400" aria-hidden="true" />
              <span className="break-words">{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="payment-issuer" className="text-obsidian-text font-medium block mb-1">
                Entidad financiera *
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
                Alias *
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

          <div className="space-y-2 border-t border-obsidian-border pt-4">
            <div className="flex items-center gap-1.5 text-obsidian-muted">
              <ShieldCheck size={14} className="text-emerald-400" />
              <span className="font-semibold text-white uppercase text-[10px] tracking-wider">
                Protección de datos de pago
              </span>
            </div>
            <p className="text-[11px] text-obsidian-muted leading-relaxed">
              El CVV/CVC no se solicita ni se guarda. El número completo de tarjeta es opcional y, si lo agregas, queda cifrado en la bóveda.
            </p>

            <div className="pt-2">
              <label htmlFor="payment-card-number" className="text-obsidian-muted block mb-1">
                Número de tarjeta (opcional)
              </label>
              <div className="relative min-w-0">
                <input
                  ref={cardNumberInputRef}
                  id="payment-card-number"
                  type={showCardNumber ? 'text' : 'password'}
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={INPUT_LIMITS.CARD_NUMBER + Math.floor((INPUT_LIMITS.CARD_NUMBER - 1) / 4)}
                  value={cardNumber.replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ')}
                  onChange={(event) => {
                    const caret = event.currentTarget.selectionStart ?? event.currentTarget.value.length;
                    cardCaretDigits.current = event.currentTarget.value.slice(0, caret).replace(/\D/g, '').length;
                    setCardNumber(event.currentTarget.value.replace(/\D/g, '').slice(0, INPUT_LIMITS.CARD_NUMBER));
                  }}
                  placeholder="•••• •••• •••• ••••"
                  aria-describedby="payment-card-number-help"
                  className="w-full min-w-0 rounded-xl border border-obsidian-border bg-obsidian-bg py-2 pl-3 pr-12 font-mono text-xs text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
                />
                <button
                  type="button"
                  aria-label={showCardNumber ? 'Ocultar número de tarjeta' : 'Mostrar número de tarjeta'}
                  aria-pressed={showCardNumber}
                  onClick={() => setShowCardNumber((visible) => !visible)}
                  className="ui-action-icon absolute inset-y-0 right-0"
                >
                  {/* [Icono] Muestra u oculta el número sin cambiarlo. */}
                  {showCardNumber ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                </button>
              </div>
              <p id="payment-card-number-help" className="mt-1 text-[10px] text-obsidian-muted">
                Se oculta al abrir el formulario y se guarda cifrado.
              </p>
            </div>
          </div>

          <div>
            <label htmlFor="payment-billing-notes" className="text-obsidian-text font-medium block mb-1">
              Notas de facturación{' '}
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
              onClick={requestClose}
              disabled={loading}
              className="ui-action-secondary"
            >{/* [Acción secundaria] Permite volver o reintentar sin modificar otros datos. */}
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="ui-action-primary"
            >{/* [Acción principal] Inicia o confirma la tarea de este espacio. */}
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
