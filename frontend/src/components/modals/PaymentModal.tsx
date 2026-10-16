import React, { useState } from 'react';
import { X, CreditCard, Shield, Lock } from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';

export const PaymentModal: React.FC = () => {
  const { isPaymentModalOpen, closePaymentModal, showToast, triggerDataReload } = useVault();

  const [issuer, setIssuer] = useState('MasterCard');
  const [alias, setAlias] = useState('');
  const [lastFour, setLastFour] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('12');
  const [expiryYear, setExpiryYear] = useState('28');
  const [cvv, setCvv] = useState('');
  const [billingNotes, setBillingNotes] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isPaymentModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alias || !lastFour) {
      showToast('Por favor completa los campos requeridos.', 'error');
      return;
    }

    setLoading(true);
    try {
      await api.createPaymentMethod({
        issuer,
        alias,
        last_four: lastFour,
        card_number: cardNumber || null,
        expiry_month: expiryMonth || null,
        expiry_year: expiryYear || null,
        cvv: cvv || null,
        billing_notes: billingNotes || null
      });
      showToast('Método de pago registrado con éxito.', 'success');
      closePaymentModal();
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div 
        className="relative w-full max-w-lg bg-obsidian-panel border border-obsidian-borderLight rounded-2xl shadow-2xl p-6 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b border-obsidian-border">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <CreditCard size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Registrar Método de Pago o Billetera
              </h2>
              <p className="text-xs text-obsidian-muted">
                Número completo y CVV protegidos con cifrado autenticado AES-256-GCM
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closePaymentModal}
            className="p-1.5 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="py-4 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-obsidian-text font-medium block mb-1">Emisor / Entidad *</label>
              <select
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
              <label className="text-obsidian-text font-medium block mb-1">Alias Identificador *</label>
              <input
                type="text"
                required
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="Ej. Nu Débito Personal, Amex Trabajo"
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-obsidian-text font-medium block mb-1">Últimos 4 Dígitos Visibles *</label>
              <input
                type="text"
                required
                maxLength={4}
                value={lastFour}
                onChange={(e) => setLastFour(e.target.value.replace(/\D/g, ''))}
                placeholder="8821"
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-obsidian-text font-medium block mb-1">Fecha de Expiración (MM/AA)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={2}
                  value={expiryMonth}
                  onChange={(e) => setExpiryMonth(e.target.value)}
                  placeholder="MM"
                  className="w-1/2 px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono text-center"
                />
                <input
                  type="text"
                  maxLength={2}
                  value={expiryYear}
                  onChange={(e) => setExpiryYear(e.target.value)}
                  placeholder="AA"
                  className="w-1/2 px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono text-center"
                />
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-obsidian-surface/60 border border-obsidian-border space-y-3">
            <span className="font-semibold text-white uppercase text-[10px] tracking-wider block">
              Datos de Bóveda Privada (Cifrado Criptográfico)
            </span>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="text-obsidian-muted block mb-1">Número Completo de Tarjeta</label>
                <input
                  type="password"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  placeholder="•••• •••• •••• ••••"
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-obsidian-muted block mb-1">CVV</label>
                <input
                  type="password"
                  maxLength={4}
                  value={cvv}
                  onChange={(e) => setCvv(e.target.value)}
                  placeholder="•••"
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono text-center focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-obsidian-text font-medium block mb-1">Notas de Facturación</label>
            <textarea
              rows={2}
              value={billingNotes}
              onChange={(e) => setBillingNotes(e.target.value)}
              placeholder="Banco emisor, fecha de corte o instrucciones de pago..."
              className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={closePaymentModal}
              className="px-4 py-2 text-xs font-medium text-obsidian-muted hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20"
            >
              {loading ? 'Guardando...' : 'Registrar Tarjeta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
