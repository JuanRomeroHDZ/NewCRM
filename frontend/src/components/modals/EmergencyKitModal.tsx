import React, { useState, useEffect } from 'react';
import { X, Shield, Printer, Download, Key, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { EmergencyKitResponse } from '../../types';

export const EmergencyKitModal: React.FC = () => {
  const { isEmergencyKitOpen, closeEmergencyKit, isUnlocked, openUnlockModal } = useVault();
  const [kit, setKit] = useState<EmergencyKitResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isEmergencyKitOpen) {
      if (!isUnlocked) {
        closeEmergencyKit();
        openUnlockModal();
        return;
      }
      setLoading(true);
      api.getEmergencyKit()
        .then(setKit)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [isEmergencyKitOpen, isUnlocked]);

  if (!isEmergencyKitOpen || !kit) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="responsive-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="emergency-kit-title"
        className="relative w-full max-w-2xl bg-obsidian-panel border border-obsidian-borderLight rounded-2xl shadow-2xl p-6 overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-obsidian-border print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
              <Shield size={20} />
            </div>
            <div>
              <h2 id="emergency-kit-title" className="text-base font-bold text-white tracking-tight">
                Hoja de Recuperación Imprimible
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md"
            >
              <Printer size={14} />
              <span>Imprimir / Guardar PDF</span>
            </button>
            <button
              type="button"
              onClick={closeEmergencyKit}
              className="p-1.5 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Sheet Body */}
        <div className="flex-1 overflow-y-auto py-5 space-y-5 text-xs text-obsidian-text font-sans print:p-0 print:text-black print:bg-white">
          {/* Sheet Header */}
          <div className="p-5 rounded-xl bg-obsidian-bg border border-obsidian-border space-y-2 print:border-black print:bg-white">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-white tracking-tight block print:text-black">
                  Hoja de recuperación LESSSO
                </span>
                <span className="text-[11px] text-obsidian-muted print:text-gray-600 font-mono">
                  Identificador de Bóveda: {kit.vault_id}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-obsidian-muted print:text-gray-600 block">Generado el:</span>
                <span className="font-mono text-xs font-semibold text-white print:text-black">{kit.generated_at}</span>
              </div>
            </div>
            <div className="text-[11px] text-obsidian-muted print:text-gray-700 pt-1">
              Código de Verificación de Bóveda: <code className="font-mono text-indigo-300 print:text-black">{kit.master_salt}</code>
            </div>
          </div>

          {/* Root Emails & Recovery Chains */}
          <div className="space-y-3">
            <h3 className="font-bold text-white text-xs uppercase tracking-wider print:text-black">
              1. Directorio de Correos Principales y Verificación 2FA
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {kit.root_emails.map((e, idx) => (
                <div key={idx} className="p-3 rounded-lg bg-obsidian-surface border border-obsidian-border print:border-gray-400 print:bg-white">
                  <span className="font-semibold text-white block print:text-black">{e.address}</span>
                  <div className="text-[10px] text-obsidian-muted print:text-gray-600 mt-0.5">
                    Proveedor: {e.provider} • 2FA: {e.two_factor} • Tel: {e.phone}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recovery Chains */}
          {kit.recovery_chains.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-bold text-white text-xs uppercase tracking-wider print:text-black">
                2. Correos de Respaldo Conectados
              </h3>
              <div className="p-3 rounded-lg bg-obsidian-surface border border-obsidian-border space-y-1.5 print:border-gray-400 print:bg-white">
                {kit.recovery_chains.map((rc, idx) => (
                  <div key={idx} className="flex items-center gap-2 font-mono text-[11px]">
                    <span className="text-white print:text-black">{rc.from_email}</span>
                    <span className="text-cyan-400 font-bold print:text-black">──────►</span>
                    <span className="text-emerald-400 print:text-black">{rc.recovers_to}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="space-y-2">
            <h3 className="font-bold text-white text-xs uppercase tracking-wider print:text-black">
              3. Recomendaciones para Guardar esta Hoja
            </h3>
            <ul className="space-y-1 text-[11px] text-obsidian-muted list-disc list-inside print:text-gray-800">
              {kit.instructions.map((inst, idx) => (
                <li key={idx}>{inst}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-obsidian-border flex items-center justify-end print:hidden">
          <button
            type="button"
            onClick={closeEmergencyKit}
            className="px-4 py-2 text-xs font-semibold text-obsidian-text bg-obsidian-surface hover:bg-obsidian-border border border-obsidian-border rounded-xl"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
