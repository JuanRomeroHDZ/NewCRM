import React from 'react';
import { ArrowUpRight, CircleCheck, Download, X } from 'lucide-react';
import { useVault } from '../../context/VaultContext';

export const ToastViewport: React.FC = () => {
  const { toasts, dismissToast, isUnlocked } = useVault();

  return (
    <div
      className="pointer-events-none fixed top-16 right-4 z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 sm:top-20 sm:right-6"
      aria-atomic="false"
    >
      {toasts.map((toast) => {
        const action = isUnlocked ? toast.action : undefined;
        if (action) {
          const Icon = toast.type === 'success' ? CircleCheck : Download;
          return (
            <div key={toast.id} role="status" className="pointer-events-auto grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 border border-obsidian-borderLight bg-obsidian-panel px-3 py-2 shadow-lg rounded-lg">
              <Icon className={`mt-2 h-4 w-4 ${toast.type === 'success' ? 'text-emerald-300' : 'text-obsidian-muted'}`} aria-hidden="true" />
              <div className="min-w-0 pt-1.5">
                <p className="text-sm font-medium text-obsidian-text">{toast.message}</p>
                {action.detail && <p className="mt-1 break-words text-xs text-obsidian-muted">{action.detail}</p>}
                <button type="button" onClick={action.run} className="ui-nav-action toast-file-action -ml-2">
                  {action.label}<ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <button type="button" onClick={() => dismissToast(toast.id)} aria-label="Cerrar notificación" className="ui-action-icon">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          );
        }
        return <div
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
        </div>;
      })}
    </div>
  );
};
