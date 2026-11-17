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
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
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
        e.stopImmediatePropagation();
        cancelRef.current();
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
      const previousFocus = previousFocusRef.current;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open, tone]);

  if (!open) return null;

  const toneIconClass =
    tone === 'danger'
      ? 'text-rose-400'
      : tone === 'warning'
      ? 'text-amber-400'
      : 'text-obsidian-muted';

  const confirmBtnClass =
    tone === 'danger'
      ? 'ui-action-danger'
      : 'ui-action-primary';

  const Icon = tone === 'danger' ? ShieldAlert : tone === 'warning' ? AlertTriangle : Info;

  return (
    <div
      className="responsive-overlay fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto overscroll-contain bg-black/75 p-3 sm:p-4 backdrop-blur-sm animate-fadeIn"
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-xl border border-obsidian-border bg-obsidian-panel p-4 shadow-xl sm:p-5"
      >
        <div className="flex items-start gap-3.5">
          <Icon size={18} className={`mt-0.5 shrink-0 ${toneIconClass}`} aria-hidden="true" />
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
          {/* [Acción secundaria] Cancelar conserva el estado anterior. */}
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            className="ui-action-secondary"
          >
            {cancelLabel}
          </button>
          {/* [Acción principal / destructiva] La intención depende de la confirmación. */}
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            className={confirmBtnClass}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
