import React, { useEffect, useId, useRef } from 'react';
import { AlertTriangle, ShieldAlert, Info } from 'lucide-react';

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'warning' | 'info';
}

interface ConfirmDialogProps extends ConfirmDialogOptions {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'warning',
  onConfirm,
  onCancel,
}) => {
  const headingId = useId();
  const descriptionId = useId();
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    // Focus cancel by default on destructive actions so accidental Enter does not destroy data.
    const focusTimer = window.setTimeout(() => {
      if (tone === 'danger') {
        cancelBtnRef.current?.focus();
      } else {
        confirmBtnRef.current?.focus();
      }
    }, 10);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      } else if (e.key === 'Tab') {
        const focusables = [cancelBtnRef.current, confirmBtnRef.current].filter(Boolean) as HTMLElement[];
        if (focusables.length < 2) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown, true);
      previousFocusRef.current?.focus?.();
    };
  }, [open, tone, onCancel]);

  if (!open) return null;

  const toneBadgeClass =
    tone === 'danger'
      ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
      : tone === 'warning'
      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
      : 'bg-sky-500/15 text-sky-400 border-sky-500/30';

  const confirmBtnClass =
    tone === 'danger'
      ? 'bg-rose-600 hover:bg-rose-500 text-white focus-visible:ring-rose-400'
      : tone === 'warning'
      ? 'bg-amber-600 hover:bg-amber-500 text-white focus-visible:ring-amber-400'
      : 'bg-brand-600 hover:bg-brand-500 text-white focus-visible:ring-brand-400';

  const Icon = tone === 'danger' ? ShieldAlert : tone === 'warning' ? AlertTriangle : Info;

  return (
    <div
      className="responsive-overlay fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-fadeIn"
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-obsidian-borderLight bg-obsidian-panel p-5 shadow-2xl"
      >
        <div className="flex items-start gap-3.5">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${toneBadgeClass}`} aria-hidden="true">
            <Icon size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id={headingId} className="text-base font-semibold text-white">
              {title}
            </h2>
            <p id={descriptionId} className="mt-1.5 text-xs leading-relaxed text-obsidian-muted whitespace-pre-line">
              {message}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            className="min-h-[44px] rounded-xl border border-obsidian-border bg-obsidian-surface px-4 py-2 text-xs font-medium text-obsidian-muted transition-colors hover:border-obsidian-borderLight hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 sm:min-h-[38px]"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            className={`min-h-[44px] rounded-xl px-4 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 sm:min-h-[38px] ${confirmBtnClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
