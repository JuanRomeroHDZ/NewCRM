import React, { useState } from 'react';
import { X, Shield, Download, Upload, Lock, Key, CheckCircle2, AlertTriangle, FileCode } from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';

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

  if (!isEncryptedBackupOpen) return null;

  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isUnlocked) {
      closeEncryptedBackup();
      openUnlockModal();
      return;
    }
    if (exportPassword.length < 8) {
      showToast('La clave de cifrado del respaldo debe tener al menos 8 caracteres.', 'warning');
      return;
    }
    if (exportPassword !== confirmPassword) {
      showToast('Las contraseñas de confirmación no coinciden.', 'error');
      return;
    }

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
      showToast(err.message || 'Error al exportar la bóveda.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        setBackupFileContent(json);
      } catch (_) {
        showToast('El archivo seleccionado no es un JSON o .emailsaver válido.', 'error');
      }
    };
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
      showToast('Por favor selecciona un archivo de respaldo .emailsaver.', 'warning');
      return;
    }
    if (!restorePassword) {
      showToast('Ingresa la contraseña con la que fue cifrado el archivo.', 'warning');
      return;
    }

    setIsRestoring(true);
    try {
      const res = await api.restoreEncryptedVault(restorePassword, backupFileContent);
      showToast(res.message || 'Bóveda restaurada con éxito.', 'success');
      triggerDataReload();
      closeEncryptedBackup();
    } catch (err: any) {
      showToast(err.message || 'Contraseña incorrecta o archivo corrupto.', 'error');
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-xl rounded-2xl border border-obsidian-border bg-obsidian-panel p-6 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-obsidian-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Respaldo Cifrado Zero-Knowledge</h2>
              <p className="text-xs text-white/50">Exportación e importación segura con Argon2id + AES-256-GCM (.emailsaver)</p>
            </div>
          </div>
          <button 
            onClick={closeEncryptedBackup} 
            className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-xl bg-obsidian-surface p-1 border border-obsidian-border">
          <button
            type="button"
            onClick={() => setTab('export')}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${
              tab === 'export' ? 'bg-indigo-600 text-white shadow-md' : 'text-white/60 hover:text-white'
            }`}
          >
            <Download className="w-3.5 h-3.5" /> Exportar Bóveda (.emailsaver)
          </button>
          <button
            type="button"
            onClick={() => setTab('restore')}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${
              tab === 'restore' ? 'bg-indigo-600 text-white shadow-md' : 'text-white/60 hover:text-white'
            }`}
          >
            <Upload className="w-3.5 h-3.5" /> Restaurar Bóveda
          </button>
        </div>

        {/* Export Form */}
        {tab === 'export' ? (
          <form onSubmit={handleExport} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-indigo-500/5 border border-indigo-500/20 text-xs text-indigo-300/80 space-y-1">
              <div className="font-semibold text-indigo-200 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" /> Cifrado de Transporte Autónomo
              </div>
              <p className="text-[11px] leading-relaxed">
                Toda la base de datos se cifra con una clave derivada al vuelo de tu contraseña elegida. Nadie sin esta clave podrá leer el archivo.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-white/70 mb-1.5">
                Contraseña de Cifrado del Respaldo
              </label>
              <input
                type="password"
                required
                placeholder="Mínimo 8 caracteres..."
                value={exportPassword}
                onChange={(e) => setExportPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-obsidian-surface border border-obsidian-border text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-white/70 mb-1.5">
                Confirmar Contraseña
              </label>
              <input
                type="password"
                required
                placeholder="Repite la contraseña..."
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-obsidian-surface border border-obsidian-border text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={closeEncryptedBackup}
                className="px-4 py-2 rounded-xl text-xs text-white/60 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isExporting}
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
                <AlertTriangle className="w-3.5 h-3.5" /> Restauración Transaccional ACID
              </div>
              <p className="text-[11px] leading-relaxed">
                Los registros del respaldo se integrarán de forma segura en la base de datos sin duplicar cuentas existentes.
              </p>
            </div>

            {/* File Upload Zone */}
            <div className="relative border-2 border-dashed border-obsidian-border hover:border-indigo-500/40 rounded-xl p-5 text-center cursor-pointer transition-colors bg-obsidian-surface/50">
              <input
                type="file"
                accept=".emailsaver,.json"
                onChange={handleFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <FileCode className="w-8 h-8 mx-auto mb-2 text-indigo-400/80" />
              <div className="text-xs font-medium text-white">
                {fileName ? fileName : 'Selecciona o arrastra tu archivo .emailsaver'}
              </div>
              <div className="text-[10px] text-white/40 mt-1">Formato cifrado estándar de EmailSaver</div>
            </div>

            <div>
              <label className="block text-xs font-medium text-white/70 mb-1.5">
                Contraseña de Descifrado del Respaldo
              </label>
              <input
                type="password"
                required
                placeholder="Contraseña con la que se creó el respaldo..."
                value={restorePassword}
                onChange={(e) => setRestorePassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-obsidian-surface border border-obsidian-border text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={closeEncryptedBackup}
                className="px-4 py-2 rounded-xl text-xs text-white/60 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isRestoring || !backupFileContent}
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
