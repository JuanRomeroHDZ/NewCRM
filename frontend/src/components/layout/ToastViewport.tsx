import React from 'react';
import { X } from 'lucide-react';
import { useVault } from '../../context/VaultContext';

export const ToastViewport: React.FC = () => {
  const { toasts, dismissToast, isUnlocked } = useVault();

  return (
    <div
      className="pointer-events-none fixed top-16 right-4 z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 sm:top-20 sm:right-6"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.type === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto p-3.5 rounded-xl border shadow-2xl backdrop-blur-md text-xs font-medium flex items-center justify-between gap-3 transition-all animate-slideUp ${
            toast.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
              : toast.type === 'warning'
              ? 'bg-amber-950/90 border-amber-500/40 text-amber-200'
              : toast.type === 'error'
              ? 'bg-rose-950/90 border-rose-500/40 text-rose-200'
              : 'bg-obsidian-panel/95 border-obsidian-borderLight text-white'
          }`}
        >
          <div className="min-w-0">
            <p className="break-words">{toast.message}</p>
            {isUnlocked && toast.action && (
              <button type="button" onClick={toast.action.run} className="ui-action-secondary mt-2">
                {toast.action.label}
              </button>
            )}
          </div>
          {/* [Icono] Descarta la notificación actual. */}
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            aria-label="Cerrar notificación"
            className="ui-action-icon shrink-0"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
};
