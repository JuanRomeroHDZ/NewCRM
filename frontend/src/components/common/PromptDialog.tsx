import React, { useEffect, useId, useRef, useState } from 'react';
import { Edit3 } from 'lucide-react';

export interface PromptDialogOptions {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  required?: boolean;
  maxLength?: number;
}

interface PromptDialogProps extends PromptDialogOptions {
  open: boolean;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export const PromptDialog: React.FC<PromptDialogProps> = ({
  open,
  title,
  message,
  defaultValue = '',
  placeholder = '',
  confirmLabel = 'Aceptar',
  cancelLabel = 'Cancelar',
  required = true,
  maxLength = 240,
  onSubmit,
  onCancel,
}) => {
  const headingId = useId();
  const messageId = useId();
  const inputId = useId();
  const errorId = useId();
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const submitBtnRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const safeMaxLength = Number.isFinite(maxLength) ? Math.max(1, Math.min(10000, Math.floor(maxLength))) : 240;

  useEffect(() => {
    if (!open) return;
    setValue(defaultValue);
    setError(null);
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 10);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      } else if (e.key === 'Tab') {
        const focusables = [inputRef.current, cancelBtnRef.current, submitBtnRef.current].filter(Boolean) as HTMLElement[];
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
  }, [open, defaultValue, onCancel]);

  if (!open) return null;

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (required && !trimmed) {
      setError('Este campo no puede quedar vacío.');
      inputRef.current?.focus();
      return;
    }
    if (trimmed.length > safeMaxLength) {
      setError(`Usa ${safeMaxLength} caracteres o menos.`);
      inputRef.current?.focus();
      return;
    }
    onSubmit(trimmed);
  };

  return (
    <div
      className="responsive-overlay fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto overscroll-contain bg-black/75 p-3 sm:p-4 backdrop-blur-sm animate-fadeIn"
      onClick={onCancel}
      role="presentation"
    >
      <form
        onSubmit={handleFormSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={message ? messageId : undefined}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-2xl border border-obsidian-borderLight bg-obsidian-panel p-4 sm:p-5 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand-500/30 bg-brand-500/10 text-brand-400" aria-hidden="true">
            <Edit3 size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id={headingId} className="text-base font-semibold text-white">
              {title}
            </h2>
            {message && (
              <p id={messageId} className="mt-1 text-xs leading-relaxed text-obsidian-muted">{message}</p>
            )}
          </div>
        </div>

        <div className="mt-4">
          <label htmlFor={inputId} className="sr-only">
            {title}
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            value={value}
            maxLength={safeMaxLength}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : message ? messageId : undefined}
            placeholder={placeholder}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            className="min-h-[44px] w-full rounded-xl border border-obsidian-borderLight bg-obsidian-surface px-3.5 py-2.5 text-sm text-white placeholder:text-obsidian-muted focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          {error && (
            <p id={errorId} role="alert" className="mt-1.5 text-xs text-rose-300">
              {error}
            </p>
          )}
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
            ref={submitBtnRef}
            type="submit"
            className="min-h-[44px] rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 sm:min-h-[38px]"
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
};
