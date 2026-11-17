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
  const [isVerifying, setIsVerifying] = useState(false);
  const [verification, setVerification] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const [error, setError] = useState('');
  const busy = isExporting || isRestoring || isVerifying || fileLoading;
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
    setVerification('');
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
    setVerification('');
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

  const handleVerify = async () => {
    if (!backupFileContent || !restorePassword || busy) {
      setError('Selecciona un respaldo e ingresa su contraseña para verificarlo.');
      return;
    }
    setError('');
    setVerification('');
    setIsVerifying(true);
    try {
      const result = await api.verifyEncryptedVault(restorePassword, backupFileContent);
      const total = Object.values(result.counts).reduce((sum, count) => sum + count, 0);
      setVerification(`Cifrado y estructura básica válidos: ${total} registros. Es parcial; esta verificación no prueba una restauración completa.`);
    } catch (err: any) {
      setError(err.message || 'No se pudo verificar el respaldo.');
    } finally {
      setIsVerifying(false);
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
        className="relative max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-xl border border-obsidian-border bg-obsidian-panel p-4 sm:p-6 shadow-xl space-y-6"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-obsidian-border">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <Shield size={18} className="mt-0.5 shrink-0 text-obsidian-muted" aria-hidden="true" />
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
            className="ui-action-icon flex-shrink-0"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* [Estado seleccionable] Cambia entre exportar y restaurar el respaldo. */}
        <div className="flex rounded-xl bg-obsidian-surface p-1 border border-obsidian-border">
          <button
            type="button"
            disabled={busy}
            aria-pressed={tab === 'export'}
            onClick={() => { setTab('export'); setError(''); }}
            className="ui-action-toggle flex-1 rounded-lg text-xs"
          >
            <Download size={16} aria-hidden="true" /> Exportar Bóveda (.emailsaver)
          </button>
          <button
            type="button"
            disabled={busy}
            aria-pressed={tab === 'restore'}
            onClick={() => { setTab('restore'); setError(''); }}
            className="ui-action-toggle flex-1 rounded-lg text-xs"
          >
            <Upload size={16} aria-hidden="true" /> Restaurar Bóveda
          </button>
        </div>

        {error && <p role="alert" className="rounded-lg border border-obsidian-border bg-obsidian-surface p-3 text-xs text-obsidian-muted">{error}</p>}
        {busy && <p role="status" className="text-xs text-obsidian-muted">{fileLoading ? 'Leyendo archivo…' : isExporting ? 'Cifrando respaldo…' : isVerifying ? 'Verificando respaldo…' : 'Restaurando respaldo…'} Espera a que termine antes de cerrar.</p>}
        {/* Export Form */}
        {tab === 'export' ? (
          <form onSubmit={handleExport} className="space-y-4">
            <div className="space-y-1 border-t border-obsidian-border pt-3 text-xs text-obsidian-muted">
              <div className="flex items-center gap-1.5 font-semibold text-obsidian-text">
                <Lock size={16} className="text-obsidian-muted" aria-hidden="true" /> Cifrado de Transporte Autónomo
              </div>
              <p className="text-[11px] leading-relaxed">
                Exporta correos, cuentas, pagos, ingresos, renovaciones, gastos, proyectos, recursos y algunas preferencias. Omite prospectos, informes HTB (incluidas revisiones, hallazgos, pizarras y evidencias), actividad y configuración del servidor. No sustituye un respaldo completo.
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

            {/* [Acción secundaria] Cancelar sale del flujo sin exportar. */}
            <div className="flex flex-wrap items-center justify-end gap-3 pt-3">
              <button
                type="button"
                disabled={busy}
                onClick={closeWhenIdle}
                className="ui-action-secondary"
              >
                Cancelar
              </button>
              {/* [Acción principal] Genera y descarga una copia cifrada de la bóveda. */}
              <button
                type="submit"
                disabled={busy}
                className="ui-action-primary"
              >
                <Download size={16} aria-hidden="true" />
                {isExporting ? 'Cifrando Bóveda...' : 'Generar y Descargar Respaldo'}
              </button>
            </div>
          </form>
        ) : (
          /* Restore Form */
          <form onSubmit={handleRestore} className="space-y-4">
            <div className="space-y-1 border-t border-obsidian-border pt-3 text-xs text-obsidian-muted">
              <div className="flex items-center gap-1.5 font-semibold text-obsidian-text">
                <AlertTriangle size={16} className="text-amber-400" aria-hidden="true" /> Restauración Transaccional Aditiva
              </div>
              <p className="text-[11px] leading-relaxed">
                Esta restauración parcial puede modificar correos, cuentas de plataforma y métodos de pago existentes; agrega ingresos y renovaciones que no existan. Aunque aparecen en el archivo, no restaura gastos, proyectos, recursos, preferencias ni tipo de cambio. Conserva un respaldo completo independiente antes de continuar.
              </p>
            </div>

            {/* File Upload Zone */}
            <div className="relative cursor-pointer rounded-lg border border-dashed border-obsidian-border p-5 text-center transition-colors hover:border-indigo-400">
              <input
                type="file"
                aria-label="Archivo de respaldo cifrado"
                disabled={busy}
                accept=".emailsaver,.json"
                onChange={handleFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <FileCode size={20} className="mx-auto mb-2 text-obsidian-muted" aria-hidden="true" />
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
                onChange={(e) => { setRestorePassword(e.target.value); setVerification(''); }}
                className="w-full px-4 py-2.5 rounded-xl bg-obsidian-surface border border-obsidian-border text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50"
              />
            </div>

            {verification && <p role="status" className="text-xs text-emerald-300">{verification}</p>}

            {/* [Acción secundaria] Verifica la contraseña sin aplicar la restauración. */}
            <div className="flex flex-wrap items-center justify-end gap-3 pt-3">
              <button type="button" disabled={busy || !backupFileContent} onClick={() => void handleVerify()} className="ui-action-secondary">Verificar sin restaurar</button>
              <button
                type="button"
                disabled={busy}
                onClick={closeWhenIdle}
                className="ui-action-secondary"
              >
                Cancelar
              </button>
              {/* [Acción principal] Aplica el respaldo cifrado seleccionado a la bóveda. */}
              <button
                type="submit"
                disabled={busy || !backupFileContent}
                className="ui-action-primary"
              >
                <Upload size={16} aria-hidden="true" />
                {isRestoring ? 'Descifrando y Restaurando...' : 'Restaurar Bóveda'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
