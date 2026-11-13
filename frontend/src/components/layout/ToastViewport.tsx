import React from 'react';
import { useVault } from '../../context/VaultContext';

export const ToastViewport: React.FC = () => {
  const { toasts, dismissToast } = useVault();

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6"
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
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            aria-label="Cerrar notificación"
            className="shrink-0 rounded p-1 text-white/50 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <span aria-hidden="true" className="text-sm font-bold">&times;</span>
          </button>
        </div>
      ))}
    </div>
  );
};
