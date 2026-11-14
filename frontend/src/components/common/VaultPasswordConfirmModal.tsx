import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { KeyRound, X } from 'lucide-react';
import { INPUT_LIMITS } from '../../lib/validation';

interface VaultPasswordConfirmModalProps {
  onCancel: () => void;
  onConfirm: (password: string) => Promise<void>;
}

export const VaultPasswordConfirmModal: React.FC<VaultPasswordConfirmModalProps> = ({ onCancel, onConfirm }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [loading, onCancel]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password) {
      setError('Escribe tu contraseña de acceso.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onConfirm(password);
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : 'No se pudo verificar la contraseña.');
      setPassword('');
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  return createPortal((
    <div className="responsive-overlay fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="copy-confirm-title"
        aria-describedby="copy-confirm-description"
        className="w-full max-w-sm rounded-2xl border border-obsidian-borderLight bg-obsidian-panel p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="rounded-lg border border-indigo-400/20 bg-indigo-400/10 p-2 text-indigo-300">
              <KeyRound size={18} aria-hidden="true" />
            </span>
            <div>
              <h2 id="copy-confirm-title" className="text-sm font-semibold text-white">Confirma tu contraseña</h2>
              <p id="copy-confirm-description" className="mt-1 text-xs leading-relaxed text-obsidian-muted">
                Se necesita para copiar este dato. No se guarda.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            aria-label="Cancelar copia"
            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-obsidian-muted hover:bg-obsidian-surface hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 disabled:opacity-50"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <label className="block space-y-1.5 text-xs font-medium text-obsidian-text">
            <span>Contraseña de la bóveda</span>
            <input
              ref={inputRef}
              type="password"
              autoComplete="current-password"
              maxLength={INPUT_LIMITS.MASTER_PASSWORD}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError(null);
              }}
              disabled={loading}
              className="min-h-11 w-full rounded-lg border border-obsidian-border bg-obsidian-bg px-3 font-mono text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
            />
          </label>
          {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-obsidian-border pt-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="min-h-10 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 text-xs font-medium text-obsidian-text hover:bg-obsidian-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !password}
              className="min-h-10 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Verificando…' : 'Copiar'}
            </button>
          </div>
        </form>
      </section>
    </div>
  ), document.body);
};
