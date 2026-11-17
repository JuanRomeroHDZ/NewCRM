import React, { useState, useEffect, useRef } from 'react';
import { Lock, ShieldAlert, KeyRound, ArrowRight, X, Eye, EyeOff } from 'lucide-react';
import { useAuditedDialog } from './useAuditedDialog';
import { useVault } from '../../context/VaultContext';
import { INPUT_LIMITS } from '../../lib/validation';

export const VaultUnlockModal: React.FC = () => {
  const {
    isUnlockModalOpen,
    closeUnlockModal,
    unlockVault,
    isSetup,
    setupMasterPassword,
    vaultStatusError,
    refreshVaultStatus,
    timeoutMinutes,
  } = useVault();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isUnlockModalOpen) {
      setPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      setError(null);
      refreshVaultStatus();
      const timer = window.setTimeout(() => inputRef.current?.focus(), 100);
      return () => window.clearTimeout(timer);
    }
  }, [isUnlockModalOpen, refreshVaultStatus]);

  const requestClose = () => {
    if (!isLoading) closeUnlockModal();
  };
  const dialogRef = useAuditedDialog(isUnlockModalOpen, requestClose, isLoading);

  if (!isUnlockModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    if (!password.trim()) {
      setError('Ingresa tu contraseña de acceso para continuar.');
      return;
    }
    if (!isSetup && password.trim().length < 8) {
      setError('La contraseña de acceso debe tener al menos 8 caracteres.');
      return;
    }
    if (!isSetup && password !== confirmPassword) {
      setError('Las contraseñas no coinciden. Verifica ambos campos.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      if (!isSetup) {
        await setupMasterPassword(password);
      } else {
        await unlockVault(password);
      }
    } catch (err: any) {
      setError(err.message || 'Contraseña incorrecta');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="responsive-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vault-modal-title"
        aria-busy={isLoading}
        className="relative w-full max-w-md bg-obsidian-panel border border-obsidian-border rounded-xl shadow-xl p-4 sm:p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Lock size={18} className="shrink-0 text-obsidian-muted" aria-hidden="true" />
            <div className="min-w-0">
              <h2 id="vault-modal-title" className="text-lg font-heading font-semibold text-white tracking-tight break-words">
                {isSetup ? 'Desbloquear bóveda' : 'Inicializar bóveda'}
              </h2>
              <p className="text-xs text-obsidian-muted">
                La bóveda protege tus datos. Tu cuenta de equipo utiliza una contraseña independiente.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={isLoading}
            aria-label="Cerrar desbloqueo de bóveda"
            className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] p-2 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-accent"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {vaultStatusError && (
          <div role="status" className="mb-4 flex items-start justify-between gap-2.5 rounded-lg border border-obsidian-border bg-obsidian-surface p-3 text-xs text-obsidian-muted">
            <div className="flex items-start gap-2 min-w-0">
              <ShieldAlert size={16} className="mt-0.5 flex-shrink-0 text-amber-400" aria-hidden="true" />
              <span className="break-words">Sin conexión con el servidor ({vaultStatusError}). Verifica que el backend esté encendido.</span>
            </div>
            <button
              type="button"
              onClick={() => { refreshVaultStatus(); }}
              className="min-h-[44px] flex-shrink-0 rounded-md border border-obsidian-border bg-obsidian-panel px-3 py-1.5 text-[11px] font-medium text-obsidian-text hover:border-amber-400/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              Reintentar
            </button>
          </div>
        )}

        {error && (
          <div role="alert" className="mb-4 flex items-center gap-2.5 rounded-lg border border-obsidian-border bg-obsidian-surface p-3 text-xs text-obsidian-muted">
            <ShieldAlert size={16} className="flex-shrink-0 text-rose-400" aria-hidden="true" />
            <span className="break-words">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="vault-unlock-password" className="block text-xs font-medium text-obsidian-text/80 mb-1.5">
              {isSetup ? 'Contraseña de acceso de la bóveda' : 'Define tu contraseña maestra (mínimo 8 caracteres)'}
            </label>
            <div className="relative flex items-center">
              <KeyRound size={16} className="absolute left-3.5 text-obsidian-muted pointer-events-none" aria-hidden="true" />
              <input
                ref={inputRef}
                id="vault-unlock-password"
                aria-invalid={Boolean(error)}
                type={showPassword ? 'text' : 'password'}
                maxLength={INPUT_LIMITS.MASTER_PASSWORD}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder={isSetup ? 'Ingresa tu contraseña de bóveda...' : 'Crea una contraseña de al menos 8 caracteres...'}
                className="w-full min-h-[44px] pl-10 pr-12 py-2.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-white placeholder-obsidian-muted/50 focus:outline-none focus:border-obsidian-accent focus:ring-1 focus:ring-obsidian-accent text-sm font-mono tracking-wider transition-all"
                autoComplete={isSetup ? 'current-password' : 'new-password'}
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-pressed={showPassword}
                disabled={isLoading}
                  className="absolute right-1 inline-flex items-center justify-center min-w-[44px] min-h-[44px] text-obsidian-muted hover:text-white rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-accent"
              >
                {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            </div>
          </div>

          {!isSetup && (
            <div>
              <label htmlFor="vault-unlock-password-confirm" className="block text-xs font-medium text-obsidian-text/80 mb-1.5">
                Confirmar contraseña maestra
              </label>
              <div className="relative flex items-center">
                <KeyRound size={16} className="absolute left-3.5 text-obsidian-muted pointer-events-none" aria-hidden="true" />
                <input
                  id="vault-unlock-password-confirm"
                  aria-invalid={Boolean(error && confirmPassword && password !== confirmPassword)}
                  type={showPassword ? 'text' : 'password'}
                  maxLength={INPUT_LIMITS.MASTER_PASSWORD}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Repite tu contraseña maestra..."
                  className="w-full min-h-[44px] pl-10 pr-3.5 py-2.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-white placeholder-obsidian-muted/50 focus:outline-none focus:border-obsidian-accent focus:ring-1 focus:ring-obsidian-accent text-sm font-mono tracking-wider transition-all"
                  autoComplete="new-password"
                  disabled={isLoading}
                />
              </div>
            </div>
          )}

          <p className="text-[11px] text-obsidian-muted leading-relaxed">
            {isSetup
              ? `Ingresa la contraseña que definiste para la bóveda. Se bloqueará automáticamente tras ${timeoutMinutes} min de inactividad. Para Red y Lab también necesitas iniciar sesión con una cuenta autorizada.`
              : `Crea una contraseña distinta de la que usarás para tu cuenta de equipo. Guárdala en un lugar seguro: no se puede recuperar si la olvidas. La bóveda se bloqueará tras ${timeoutMinutes} min de inactividad.`}
          </p>

          <div className="pt-2 flex flex-wrap items-center justify-end gap-2.5">
            {/* [Acción secundaria] Cierra el diálogo sin modificar la bóveda. */}
            <button
              type="button"
              onClick={requestClose}
              disabled={isLoading}
              className="ui-action-secondary"
            >
              Cancelar
            </button>
            {/* [Acción principal] Desbloquea o configura la bóveda. */}
            <button
              type="submit"
              disabled={isLoading || !password || (!isSetup && !confirmPassword)}
              className="ui-action-primary"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>{isSetup ? 'Desbloquear bóveda' : 'Configurar bóveda'}</span>
                  <ArrowRight size={14} aria-hidden="true" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
