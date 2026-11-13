import React, { useEffect, useState } from 'react';
import { Printer, Shield, X } from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { EmergencyKitResponse } from '../../types';

const verificationLabels: Record<string, string> = {
  authenticator: 'Aplicación de verificación',
  passkey: 'Llave de acceso',
  sms: 'Mensaje de texto',
  email: 'Correo de recuperación',
  none: 'Sin activar',
};

export const EmergencyKitModal: React.FC = () => {
  const { isEmergencyKitOpen, closeEmergencyKit, isUnlocked, openUnlockModal } = useVault();
  const [kit, setKit] = useState<EmergencyKitResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isEmergencyKitOpen) return;
    if (!isUnlocked) {
      closeEmergencyKit();
      openUnlockModal();
      return;
    }
    let active = true;
    setLoading(true);
    setError(false);
    api.getEmergencyKit()
      .then((result) => { if (active) setKit(result); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isEmergencyKitOpen, isUnlocked, attempt]);

  if (!isEmergencyKitOpen) return null;

  return (
    <div className="recovery-overlay responsive-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 backdrop-blur-md sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="emergency-kit-title" className="recovery-print relative flex max-h-[92dvh] w-full max-w-2xl min-w-0 flex-col overflow-hidden rounded-2xl border border-obsidian-borderLight bg-obsidian-panel p-4 shadow-2xl sm:p-6">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-obsidian-border pb-4 print:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <Shield size={20} className="shrink-0 text-indigo-400" />
            <h2 id="emergency-kit-title" className="min-w-0 text-base font-bold text-white">Hoja de recuperación</h2>
          </div>
          <div className="flex max-w-full flex-wrap items-center gap-2">
            <button type="button" disabled={!kit || loading} onClick={() => window.print()} className="inline-flex min-h-10 max-w-full items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-left text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
              <Printer size={14} className="shrink-0" /> Imprimir o guardar PDF
            </button>
            <button type="button" onClick={closeEmergencyKit} aria-label="Cerrar" className="rounded-lg p-2 text-obsidian-muted hover:bg-obsidian-surface hover:text-white"><X size={18} /></button>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto py-4 text-sm text-obsidian-text print:overflow-visible print:text-black">
          {loading && <p role="status">Preparando tu hoja…</p>}
          {error && <div role="alert" className="space-y-2"><p>No se pudo preparar la hoja.</p><button type="button" onClick={() => setAttempt((value) => value + 1)} className="text-indigo-300 underline">Intentar de nuevo</button></div>}
          {kit && !loading && !error && <>
            <div className="space-y-1"><h3 className="font-bold text-white print:text-black">Hoja de recuperación</h3><p className="text-xs text-obsidian-muted print:text-gray-700">Guarda esta hoja en un lugar seguro. No incluye tus contraseñas ni sustituye una copia de tus datos.</p></div>
            <section className="space-y-2"><h3 className="font-semibold text-white print:text-black">Correos principales</h3>
              {kit.root_emails.length === 0 ? <p className="text-xs text-obsidian-muted">No hay correos registrados.</p> : <ul className="divide-y divide-obsidian-border">{kit.root_emails.map((email, index) => <li key={`${email.address}-${index}`} className="break-words py-2"><span className="font-medium text-white print:text-black">{email.address}</span><p className="text-xs text-obsidian-muted print:text-gray-700">{email.provider} · Verificación: {verificationLabels[email.two_factor] || email.two_factor}{email.phone && email.phone !== 'N/A' ? ` · Teléfono: ${email.phone}` : ''}</p></li>)}</ul>}
            </section>
            {kit.recovery_chains.length > 0 && <section className="space-y-2"><h3 className="font-semibold text-white print:text-black">Correos de recuperación</h3><ul className="space-y-2">{kit.recovery_chains.map((chain, index) => <li key={`${chain.from_email}-${index}`} className="break-words text-xs">{chain.from_email} → {chain.recovers_to}</li>)}</ul></section>}
            <p className="text-xs text-obsidian-muted print:text-gray-700">Guarda también tu contraseña de acceso y una copia de seguridad en lugares separados.</p>
          </>}
        </div>
        <div className="flex justify-end border-t border-obsidian-border pt-3 print:hidden"><button type="button" onClick={closeEmergencyKit} className="rounded-xl border border-obsidian-border bg-obsidian-surface px-4 py-2 text-xs font-semibold text-obsidian-text hover:bg-obsidian-border">Cerrar</button></div>
      </div>
    </div>
  );
};
