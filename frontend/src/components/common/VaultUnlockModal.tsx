import React, { useState, useEffect, useRef } from 'react';
import { Lock, ShieldAlert, KeyRound, ArrowRight, X } from 'lucide-react';
import { useVault } from '../../context/VaultContext';

export const VaultUnlockModal: React.FC = () => {
  const { isUnlockModalOpen, closeUnlockModal, unlockVault, isSetup, setupMasterPassword } = useVault();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isUnlockModalOpen) {
      setPassword('');
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isUnlockModalOpen]);

  if (!isUnlockModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div 
        className="relative w-full max-w-md bg-obsidian-panel border border-obsidian-borderLight rounded-2xl shadow-2xl p-6 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle accent glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent" />

        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Lock size={22} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white tracking-tight">
                {isSetup ? 'Desbloquear Bóveda Cifrada' : 'Inicializar Bóveda Maestra'}
              </h2>
              <p className="text-xs text-obsidian-muted">
                Nivel 2 de Seguridad — Cifrado Argon2id + AES-256-GCM
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeUnlockModal}
            className="p-1.5 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center gap-2.5 text-rose-400 text-xs animate-shake">
            <ShieldAlert size={16} className="flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-obsidian-text/80 mb-1.5">
              {isSetup ? 'Contraseña Maestra / PIN' : 'Crea tu Contraseña Maestra'}
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••••••"
                className="w-full px-3.5 py-2.5 pl-10 rounded-xl bg-obsidian-bg border border-obsidian-border text-white placeholder-obsidian-muted/50 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm font-mono tracking-wider transition-all"
                autoComplete="current-password"
                disabled={isLoading}
              />
              <KeyRound size={16} className="absolute left-3.5 top-3 text-obsidian-muted" />
            </div>
            <p className="mt-1.5 text-[11px] text-obsidian-muted">
              Demo predeterminada: <code className="text-indigo-300 font-mono">MasterPassword123!</code>
            </p>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={closeUnlockModal}
              className="px-4 py-2 text-xs font-medium text-obsidian-muted hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading || !password}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Desbloquear Bóveda</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
