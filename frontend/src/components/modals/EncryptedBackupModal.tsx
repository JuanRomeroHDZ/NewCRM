import React, { useState } from 'react';
import { X, Shield, Download, Upload, Lock, AlertTriangle, FileCode } from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { INPUT_LIMITS } from '../../lib/validation';
import { useTransferDialog } from './useTransferDialog';

export const EncryptedBackupModal: React.FC = () => {
  const { isEncryptedBackupOpen, closeEncryptedBackup, showToast, triggerDataReload, isUnlocked, openUnlockModal } = useVault();
  const [tab, setTab] = useState<'export' | 'restore'>('export');

  // Export State
  const [exportPassword, setExportPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  // Restore State
  const [restorePassword, setRestorePassword] = useState('');
  const [backupFileContent, setBackupFileContent] = useState<any | null>(null);
  const [fileName, setFileName] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [error, setError] = useState('');
  const busy = isExporting || isRestoring || fileLoading;
  const dialogRef = useTransferDialog(isEncryptedBackupOpen, closeEncryptedBackup, busy);
  const closeWhenIdle = () => { if (!busy) closeEncryptedBackup(); };

  if (!isEncryptedBackupOpen) return null;

  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isUnlocked) {
      closeEncryptedBackup();
      openUnlockModal();
      return;
    }
    if (exportPassword.length < 8) {
      setError('La clave de cifrado del respaldo debe tener al menos 8 caracteres.');
      return;
    }
    if (exportPassword !== confirmPassword) {
      setError('Las contraseñas de confirmación no coinciden.');
      return;
    }

    if (busy) return;
    setError('');
    setIsExporting(true);
    try {
      const payload = await api.exportEncryptedVault(exportPassword);
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `emailsaver-backup-${new Date().toISOString().split('T')[0]}.emailsaver`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      showToast('Bóveda cifrada exportada con éxito (.emailsaver).', 'success');
      setExportPassword('');
      setConfirmPassword('');
      closeEncryptedBackup();
    } catch (err: any) {
      setError(err.message || 'Error al exportar la bóveda. Intenta de nuevo.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setBackupFileContent(null);
    setFileName('');
    setError('');
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setError('El respaldo supera el límite de 20 MB.'); return; }
    setFileLoading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('Formato inválido');
        setBackupFileContent(json);
        setFileName(file.name);
      } catch (_) {
        setError('El archivo seleccionado no es un JSON o .emailsaver válido. Selecciona otro archivo.');
      } finally { setFileLoading(false); }
    };
    reader.onerror = () => { setError('No se pudo leer el archivo. Selecciónalo de nuevo.'); setFileLoading(false); };
    reader.readAsText(file);
  };

  const handleRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isUnlocked) {
      closeEncryptedBackup();
      openUnlockModal();
      return;
    }
    if (!backupFileContent) {
      setError('Selecciona un archivo de respaldo .emailsaver.');
      return;
    }
    if (!restorePassword) {
      setError('Ingresa la contraseña con la que fue cifrado el archivo.');
      return;
    }

    if (busy) return;
    setError('');
    setIsRestoring(true);
    try {
      const res = await api.restoreEncryptedVault(restorePassword, backupFileContent);
      showToast(res.message || 'Bóveda restaurada con éxito.', 'success');
      triggerDataReload();
      closeEncryptedBackup();
    } catch (err: any) {
      setError(err.message || 'Contraseña incorrecta o archivo corrupto.');
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div
      className="responsive-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeWhenIdle();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        aria-busy={busy}
        role="dialog"
        aria-modal="true"
        aria-labelledby="backup-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-obsidian-border bg-obsidian-panel p-4 sm:p-6 shadow-2xl space-y-6"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-obsidian-border">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 flex-shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 id="backup-modal-title" className="text-lg font-bold text-white break-words">Respaldo Cifrado de Bóveda</h2>
              <p className="text-xs text-obsidian-muted">Guarda o recupera una copia protegida de tus datos</p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            aria-label="Cerrar respaldo"
            onClick={closeWhenIdle}
            className="inline-flex min-w-[44px] min-h-[44px] lg:min-w-9 lg:min-h-9 items-center justify-center p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-all flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-xl bg-obsidian-surface p-1 border border-obsidian-border">
          <button
            type="button"
            disabled={busy}
            aria-pressed={tab === 'export'}
            onClick={() => { setTab('export'); setError(''); }}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${
              tab === 'export' ? 'bg-indigo-600 text-white shadow-md' : 'text-white/60 hover:text-white'
            }`}
          >
            <Download className="w-3.5 h-3.5" /> Exportar Bóveda (.emailsaver)
          </button>
          <button
            type="button"
            disabled={busy}
            aria-pressed={tab === 'restore'}
            onClick={() => { setTab('restore'); setError(''); }}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${
              tab === 'restore' ? 'bg-indigo-600 text-white shadow-md' : 'text-white/60 hover:text-white'
            }`}
          >
            <Upload className="w-3.5 h-3.5" /> Restaurar Bóveda
          </button>
        </div>

        {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-obsidian-dangerBg p-3 text-xs text-rose-200">{error}</p>}
        {busy && <p role="status" className="text-xs text-obsidian-muted">{fileLoading ? 'Leyendo archivo…' : isExporting ? 'Cifrando respaldo…' : 'Restaurando respaldo…'} Espera a que termine antes de cerrar.</p>}
        {/* Export Form */}
        {tab === 'export' ? (
          <form onSubmit={handleExport} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-indigo-500/5 border border-indigo-500/20 text-xs text-indigo-300/80 space-y-1">
              <div className="font-semibold text-indigo-200 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" /> Cifrado de Transporte Autónomo
              </div>
              <p className="text-[11px] leading-relaxed">
                Este archivo contiene solo una parte de la información. No incluye prospectos ni historial de actividad y no sustituye un respaldo completo de la base de datos.
              </p>
            </div>

            <div>
              <label htmlFor="export-backup-password" className="block text-xs font-medium text-white/70 mb-1.5">
                Contraseña de Cifrado del Respaldo
              </label>
              <input
                id="export-backup-password"
                disabled={busy}
                type="password"
                required
                maxLength={INPUT_LIMITS.MASTER_PASSWORD}
                placeholder="Mínimo 8 caracteres..."
                value={exportPassword}
                onChange={(e) => setExportPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-obsidian-surface border border-obsidian-border text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50"
              />
            </div>

            <div>
              <label htmlFor="confirm-backup-password" className="block text-xs font-medium text-white/70 mb-1.5">
                Confirmar Contraseña
              </label>
              <input
                id="confirm-backup-password"
                disabled={busy}
                type="password"
                required
                maxLength={INPUT_LIMITS.MASTER_PASSWORD}
                placeholder="Repite la contraseña..."
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-obsidian-surface border border-obsidian-border text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50"
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 pt-3">
              <button
                type="button"
                disabled={busy}
                onClick={closeWhenIdle}
                className="px-4 py-2 rounded-xl text-xs text-white/60 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                {isExporting ? 'Cifrando Bóveda...' : 'Generar y Descargar Respaldo'}
              </button>
            </div>
          </form>
        ) : (
          /* Restore Form */
          <form onSubmit={handleRestore} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-amber-300/80 space-y-1">
              <div className="font-semibold text-amber-200 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Restauración Transaccional Aditiva
              </div>
              <p className="text-[11px] leading-relaxed">
                La restauración es parcial y puede modificar cuentas y métodos de pago existentes. Algunos datos exportados no se restauran. Conserva un respaldo completo independiente antes de continuar.
              </p>
            </div>

            {/* File Upload Zone */}
            <div className="relative border-2 border-dashed border-obsidian-border hover:border-indigo-500/40 rounded-xl p-5 text-center cursor-pointer transition-colors bg-obsidian-surface/50">
              <input
                type="file"
                aria-label="Archivo de respaldo cifrado"
                disabled={busy}
                accept=".emailsaver,.json"
                onChange={handleFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <FileCode className="w-8 h-8 mx-auto mb-2 text-indigo-400/80" />
              <div className="text-xs font-medium text-white truncate">
                {fileName ? fileName : 'Selecciona tu archivo .emailsaver'}
              </div>
              <div className="text-[10px] text-white/40 mt-1">Respaldo cifrado compatible con archivos .emailsaver</div>
            </div>

            <div>
              <label htmlFor="restore-backup-password" className="block text-xs font-medium text-white/70 mb-1.5">
                Contraseña de Descifrado del Respaldo
              </label>
              <input
                id="restore-backup-password"
                disabled={busy}
                type="password"
                required
                maxLength={INPUT_LIMITS.MASTER_PASSWORD}
                placeholder="Contraseña con la que se creó el respaldo..."
                value={restorePassword}
                onChange={(e) => setRestorePassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-obsidian-surface border border-obsidian-border text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50"
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 pt-3">
              <button
                type="button"
                disabled={busy}
                onClick={closeWhenIdle}
                className="px-4 py-2 rounded-xl text-xs text-white/60 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy || !backupFileContent}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                {isRestoring ? 'Descifrando y Restaurando...' : 'Restaurar Bóveda'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
