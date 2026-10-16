import React, { useState, useEffect } from 'react';
import { 
  Settings, Lock, Key, Clock, Shield, Download, 
  Upload, Check, AlertCircle, Save, Palette 
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';

export const SettingsView: React.FC = () => {
  const { 
    isUnlocked, openUnlockModal, timeoutMinutes, 
    clipboardClearSeconds, allowRevealPasswords, searchHotkey, 
    accentColor, setAccentColor, canvasStyle, setCanvasStyle, 
    openImportModal, refreshVaultStatus, showToast 
  } = useVault();

  const [localTimeout, setLocalTimeout] = useState(timeoutMinutes);
  const [localClipboard, setLocalClipboard] = useState(clipboardClearSeconds);
  const [localReveal, setLocalReveal] = useState(allowRevealPasswords);
  const [localHotkey, setLocalHotkey] = useState(searchHotkey);
  const [localAccent, setLocalAccent] = useState(accentColor || '#6366f1');
  const [localCanvas, setLocalCanvas] = useState(canvasStyle || 'dot-grid');

  const [newMasterPassword, setNewMasterPassword] = useState('');
  const [confirmMasterPassword, setConfirmMasterPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setLocalTimeout(timeoutMinutes);
    setLocalClipboard(clipboardClearSeconds);
    setLocalReveal(allowRevealPasswords);
    setLocalHotkey(searchHotkey);
    setLocalAccent(accentColor || '#6366f1');
    setLocalCanvas(canvasStyle || 'dot-grid');
  }, [timeoutMinutes, clipboardClearSeconds, allowRevealPasswords, searchHotkey, accentColor, canvasStyle]);

  if (!isUnlocked) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center space-y-6 pt-24 animate-fadeIn">
        <div className="w-16 h-16 mx-auto rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
          <Lock size={32} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Configuración & Parámetros de Bóveda Protegidos
          </h2>
          <p className="text-xs text-obsidian-muted mt-1 max-w-md mx-auto">
            Para modificar tiempos de auto-bloqueo o exportar la bóveda cifrada, introduce tu contraseña maestra.
          </p>
        </div>
        <button
          type="button"
          onClick={openUnlockModal}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30"
        >
          <span>Desbloquear con Contraseña Maestra</span>
        </button>
      </div>
    );
  }

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload: any = {
        vault_timeout_minutes: localTimeout,
        clipboard_clear_seconds: localClipboard,
        allow_reveal_passwords: localReveal,
        search_hotkey: localHotkey,
        accent_color: localAccent,
        canvas_style: localCanvas
      };

      if (newMasterPassword) {
        if (newMasterPassword.length < 6) {
          showToast('La nueva contraseña debe tener al menos 6 caracteres.', 'error');
          setIsSaving(false);
          return;
        }
        if (newMasterPassword !== confirmMasterPassword) {
          showToast('Las contraseñas maestras no coinciden.', 'error');
          setIsSaving(false);
          return;
        }
        payload.new_master_password = newMasterPassword;
      }

      await api.updateSettings(payload);
      setAccentColor(localAccent);
      setCanvasStyle(localCanvas);
      await refreshVaultStatus();
      setNewMasterPassword('');
      setConfirmMasterPassword('');
      showToast('Configuraciones de seguridad y estética actualizadas con éxito.', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportVault = async () => {
    try {
      const data = await api.exportVault();
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `emailsaver-encrypted-vault-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Respaldo cifrado exportado exitosamente.', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const colorOptions = [
    { name: 'Índigo', color: '#6366f1' },
    { name: 'Violeta', color: '#8b5cf6' },
    { name: 'Cian', color: '#06b6d4' },
    { name: 'Esmeralda', color: '#10b981' },
    { name: 'Rosa Neón', color: '#f43f5e' },
    { name: 'Ámbar', color: '#f59e0b' },
  ];

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8 animate-fadeIn">
      <div>
        <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
          <Settings className="text-indigo-400" size={18} />
          <span>Configuración del Sistema & Bóveda Cifrada</span>
        </h2>
        <p className="text-xs text-obsidian-muted">
          Políticas de auto-bloqueo, higiene de portapapeles, estética Notion/Obsidian y respaldo criptográfico
        </p>
      </div>

      <form onSubmit={handleSavePreferences} className="space-y-6">
        {/* Visual Customization (Notion & Obsidian aesthetics) */}
        <div className="p-6 rounded-2xl bg-obsidian-panel border border-obsidian-border space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Palette size={16} className="text-indigo-400" />
            <span>Personalización Estética (Notion & Obsidian Style)</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Accent color picker */}
            <div className="space-y-2">
              <label className="text-obsidian-text font-medium block">
                Color de Acento de la Interfaz
              </label>
              <div className="flex items-center gap-2.5">
                {colorOptions.map((opt) => (
                  <button
                    key={opt.color}
                    type="button"
                    onClick={() => setLocalAccent(opt.color)}
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                      localAccent === opt.color ? 'ring-2 ring-white ring-offset-2 ring-offset-obsidian-panel scale-110' : 'opacity-70 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: opt.color }}
                    title={opt.name}
                  >
                    {localAccent === opt.color && <Check size={14} className="text-white" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Canvas pattern */}
            <div className="space-y-1.5">
              <label className="text-obsidian-text font-medium block">
                Estilo de Matriz del Lienzo de Grafo
              </label>
              <select
                value={localCanvas}
                onChange={(e) => setLocalCanvas(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="dot-grid">Matriz de Puntos Obsidian (.dot-grid)</option>
                <option value="subtle-grid">Cuadrícula Fina Notion (32px)</option>
                <option value="plain">Grafito Oscuro Liso (Sin patrón)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Security Parameters */}
        <div className="p-6 rounded-2xl bg-obsidian-panel border border-obsidian-border space-y-5">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Shield size={16} className="text-indigo-400" />
            <span>Políticas de Sesión & Portapapeles</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Auto-Lock timer */}
            <div className="space-y-1.5">
              <label className="text-obsidian-text font-medium block">
                Tiempo de Auto-Bloqueo de Bóveda por Inactividad
              </label>
              <select
                value={localTimeout}
                onChange={(e) => setLocalTimeout(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
              >
                <option value={1}>1 minuto</option>
                <option value={5}>5 minutos</option>
                <option value={10}>10 minutos (Recomendado)</option>
                <option value={30}>30 minutos</option>
                <option value={60}>1 hora</option>
              </select>
            </div>

            {/* Clipboard clear timer */}
            <div className="space-y-1.5">
              <label className="text-obsidian-text font-medium block">
                Vaciado Automático del Portapapeles
              </label>
              <select
                value={localClipboard}
                onChange={(e) => setLocalClipboard(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
              >
                <option value={10}>10 segundos</option>
                <option value={20}>20 segundos</option>
                <option value={30}>30 segundos (Predeterminado)</option>
                <option value={60}>60 segundos</option>
              </select>
            </div>

            {/* Search Hotkey */}
            <div className="space-y-1.5">
              <label className="text-obsidian-text font-medium block">
                Atajo de Teclado del Buscador Global
              </label>
              <input
                type="text"
                value={localHotkey}
                onChange={(e) => setLocalHotkey(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Reveal passwords toggle */}
            <div className="space-y-1.5 flex flex-col justify-end">
              <label className="flex items-center gap-3 p-2 rounded-xl bg-obsidian-bg border border-obsidian-border cursor-pointer">
                <input
                  type="checkbox"
                  checked={localReveal}
                  onChange={(e) => setLocalReveal(e.target.checked)}
                  className="rounded border-obsidian-border bg-obsidian-panel text-indigo-600 focus:ring-0"
                />
                <div>
                  <span className="text-white font-medium block">Permitir Revelar Claves en Pantalla</span>
                  <span className="text-[10px] text-obsidian-muted block">
                    Por defecto permanecen ocultas con botón de copia
                  </span>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Change Master Password */}
        <div className="p-6 rounded-2xl bg-obsidian-panel border border-obsidian-border space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Key size={16} className="text-indigo-400" />
            <span>Rotación de Contraseña Maestra (Argon2id)</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              <label className="text-obsidian-text font-medium block">
                Nueva Contraseña Maestra
              </label>
              <input
                type="password"
                value={newMasterPassword}
                onChange={(e) => setNewMasterPassword(e.target.value)}
                placeholder="Dejar en blanco si no deseas cambiarla"
                className="w-full px-3.5 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-obsidian-text font-medium block">
                Confirmar Nueva Contraseña Maestra
              </label>
              <input
                type="password"
                value={confirmMasterPassword}
                onChange={(e) => setConfirmMasterPassword(e.target.value)}
                placeholder="Repetir nueva contraseña"
                className="w-full px-3.5 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Save button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50"
          >
            <Save size={14} />
            <span>{isSaving ? 'Guardando...' : 'Guardar Cambios de Configuración'}</span>
          </button>
        </div>
      </form>

      {/* Backup & Import/Export Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Import */}
        <div className="p-5 rounded-2xl bg-obsidian-panel border border-obsidian-border flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Upload size={16} className="text-emerald-400" />
              <span>Importar Contraseñas & Bóvedas</span>
            </h3>
            <p className="text-xs text-obsidian-muted mt-1">
              Migración asistida desde Bitwarden, 1Password, Google Chrome o archivos CSV/JSON.
            </p>
          </div>
          <button
            type="button"
            onClick={openImportModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-obsidian-surface hover:bg-obsidian-border border border-obsidian-border text-white text-xs font-semibold transition-all w-full"
          >
            <Upload size={14} />
            <span>Abrir Asistente de Importación</span>
          </button>
        </div>

        {/* Export */}
        <div className="p-5 rounded-2xl bg-obsidian-panel border border-obsidian-border flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Download size={16} className="text-cyan-400" />
              <span>Exportar Respaldo Cifrado</span>
            </h3>
            <p className="text-xs text-obsidian-muted mt-1">
              Descarga un archivo JSON encriptado con todos tus correos, plataformas y tarjetas.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportVault}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-obsidian-surface hover:bg-obsidian-border border border-obsidian-border text-white text-xs font-semibold transition-all w-full"
          >
            <Download size={14} />
            <span>Exportar Bóveda (.json)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
