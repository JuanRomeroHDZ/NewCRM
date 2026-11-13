import React, { useState, useEffect } from 'react';
import { 
  Settings, Lock, Key, Shield, Download, 
  Upload, Check, Save, Palette, Clock, Target 
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { InfoTooltip } from '../common/InfoTooltip';
import { INPUT_LIMITS } from '../../lib/validation';
import { OperatorAuthSection } from '../settings/OperatorAuthSection';

export const SettingsView: React.FC = () => {
  const { 
    isUnlocked, openUnlockModal, timeoutMinutes, 
    clipboardClearSeconds, allowRevealPasswords, searchHotkey, 
    accentColor, setAccentColor, canvasStyle, setCanvasStyle, 
    openImportModal, refreshVaultStatus, showToast, triggerDataReload 
  } = useVault();

  const [localTimeout, setLocalTimeout] = useState(timeoutMinutes);
  const [localClipboard, setLocalClipboard] = useState(clipboardClearSeconds);
  const [localReveal, setLocalReveal] = useState(allowRevealPasswords);
  const [localHotkey, setLocalHotkey] = useState(searchHotkey);
  const [localAccent, setLocalAccent] = useState(accentColor || '#6366f1');
  const [localCanvas, setLocalCanvas] = useState(canvasStyle || 'dot-grid');

  // Phase 7 Operational & Security Policies
  const [rotationRootDays, setRotationRootDays] = useState<number>(90);
  const [rotationSecondaryDays, setRotationSecondaryDays] = useState<number>(180);
  const [trashRetentionDays, setTrashRetentionDays] = useState<number>(0);
  const [maxFollowupAttempts, setMaxFollowupAttempts] = useState<number>(3);
  const [budgetCapAmount, setBudgetCapAmount] = useState<string>('0');
  const [budgetCapCurrency, setBudgetCapCurrency] = useState<'MXN' | 'USD'>('MXN');

  const [newMasterPassword, setNewMasterPassword] = useState('');
  const [confirmMasterPassword, setConfirmMasterPassword] = useState('');
  const [currentMasterPassword, setCurrentMasterPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setLocalTimeout(timeoutMinutes);
    setLocalClipboard(clipboardClearSeconds);
    setLocalReveal(allowRevealPasswords);
    setLocalHotkey(searchHotkey);
    setLocalAccent(accentColor || '#6366f1');
    setLocalCanvas(canvasStyle || 'dot-grid');
  }, [timeoutMinutes, clipboardClearSeconds, allowRevealPasswords, searchHotkey, accentColor, canvasStyle]);

  useEffect(() => {
    api.getVaultStatus()
      .then((st) => {
        if (typeof st.password_rotation_days_root === 'number') setRotationRootDays(st.password_rotation_days_root);
        if (typeof st.password_rotation_days_secondary === 'number') setRotationSecondaryDays(st.password_rotation_days_secondary);
        if (typeof st.trash_retention_days === 'number') setTrashRetentionDays(st.trash_retention_days);
        if (typeof st.max_followup_attempts === 'number') setMaxFollowupAttempts(st.max_followup_attempts);
        if (typeof st.budget_cap_amount === 'number') setBudgetCapAmount(String(st.budget_cap_amount));
        if (st.budget_cap_currency === 'USD' || st.budget_cap_currency === 'MXN') {
          setBudgetCapCurrency(st.budget_cap_currency);
        }
      })
      .catch(() => {});
  }, [isUnlocked]);

  if (!isUnlocked) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center space-y-6 pt-24 animate-fadeIn">
        <div className="w-16 h-16 mx-auto rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
          <Lock size={32} />
        </div>
        <div className="flex items-center justify-center gap-2">
          <h2 className="text-xl font-bold text-white tracking-tight">
            Ajustes Protegidos
          </h2>
          <InfoTooltip
            title="Protección con contraseña de acceso"
            content="Ingresa tu contraseña de acceso para cambiar ajustes de seguridad o descargar respaldos."
          />
        </div>
        <button
          type="button"
          onClick={openUnlockModal}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30"
        >
          <span>Desbloquear con contraseña de acceso</span>
        </button>
      </div>
    );
  }

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const capNum = budgetCapAmount.trim() === '' ? 0 : Number(budgetCapAmount);
      if (!Number.isFinite(capNum) || capNum < 0 || capNum > INPUT_LIMITS.BUDGET_CAP) {
        showToast(`Ingresa un presupuesto entre 0 y ${INPUT_LIMITS.BUDGET_CAP.toLocaleString('es-MX')}.`, 'error');
        return;
      }
      const payload: any = {
        vault_timeout_minutes: localTimeout,
        clipboard_clear_seconds: localClipboard,
        allow_reveal_passwords: localReveal,
        search_hotkey: localHotkey,
        accent_color: localAccent,
        canvas_style: localCanvas,
        password_rotation_days_root: rotationRootDays,
        password_rotation_days_secondary: rotationSecondaryDays,
        trash_retention_days: trashRetentionDays,
        max_followup_attempts: maxFollowupAttempts,
        budget_cap_amount: capNum,
        budget_cap_currency: budgetCapCurrency
      };

      if (newMasterPassword) {
        if (newMasterPassword.length < 8) {
          showToast('La nueva contraseña debe tener al menos 8 caracteres.', 'error');
          setIsSaving(false);
          return;
        }
        if (!currentMasterPassword) {
          showToast('Ingresa tu contraseña actual para confirmar el cambio.', 'error');
          return;
        }
        if (newMasterPassword !== confirmMasterPassword) {
          showToast('Las contraseñas de acceso no coinciden.', 'error');
          setIsSaving(false);
          return;
        }
        payload.new_master_password = newMasterPassword;
        payload.current_master_password = currentMasterPassword;
      }

      await api.updateSettings(payload);
      setAccentColor(localAccent);
      setCanvasStyle(localCanvas);
      await refreshVaultStatus();
      triggerDataReload();
      setNewMasterPassword('');
      setConfirmMasterPassword('');
      setCurrentMasterPassword('');
      showToast('Ajustes de seguridad, presupuesto y preferencias guardados.', 'success');
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
      showToast('Respaldo encriptado descargado exitosamente.', 'success');
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
    <div className="mx-auto max-w-4xl min-w-0 space-y-5 p-3 sm:space-y-7 sm:p-8 animate-fadeIn">
      <div className="flex items-center gap-2 min-w-0">
        <Settings className="text-indigo-400 flex-shrink-0" size={18} />
        <h2 className="text-base font-bold text-white tracking-tight truncate">
          Ajustes y Seguridad
        </h2>
        <InfoTooltip
          title="Ajustes Generales"
          content="Configura el bloqueo por inactividad, borrado automático del portapapeles, avisos de cambio de contraseña, papelera y presupuesto mensual."
        />
      </div>

      <form onSubmit={handleSavePreferences} className="space-y-6">
        {/* Visual Customization (Notion & Obsidian aesthetics) */}
        <div className="min-w-0 space-y-4 rounded-xl border border-obsidian-border bg-obsidian-panel p-3 sm:p-5">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Palette size={16} className="text-indigo-400" />
            <span>Apariencia</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Accent color picker */}
            <div className="space-y-2">
              <label className="text-obsidian-text font-medium block">
                Color Principal de la Interfaz
              </label>
              <div className="flex flex-wrap items-center gap-2.5">
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
                Fondo del Mapa de Conexiones
              </label>
              <select
                value={localCanvas}
                onChange={(e) => setLocalCanvas(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="dot-grid">Puntos Discretos</option>
                <option value="subtle-grid">Cuadrícula Fina</option>
                <option value="plain">Fondo Liso</option>
              </select>
            </div>
          </div>
        </div>

        {/* Security Parameters */}
        <div className="min-w-0 space-y-5 rounded-xl border border-obsidian-border bg-obsidian-panel p-3 sm:p-5">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-indigo-400" />
            <h3 className="text-sm font-bold text-white">Sesión y Portapapeles</h3>
            <InfoTooltip content="Elige cuántos minutos permanece desbloqueada la sesión y cuántos segundos dura una contraseña copiada antes de borrarse del portapapeles." />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Auto-Lock timer */}
            <div className="space-y-1.5">
              <label className="text-obsidian-text font-medium block">
                Bloquear Automáticamente por Inactividad
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
                Borrar Contraseña Copiada del Portapapeles
              </label>
              <select
                value={localClipboard}
                onChange={(e) => setLocalClipboard(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
              >
                <option value={10}>A los 10 segundos</option>
                <option value={20}>A los 20 segundos</option>
                <option value={30}>A los 30 segundos (Predeterminado)</option>
                <option value={60}>A los 60 segundos</option>
              </select>
            </div>

            {/* Search Hotkey */}
            <div className="space-y-1.5">
              <label className="text-obsidian-text font-medium block">
                Atajo de Teclado del Buscador Rápido
              </label>
              <input
                type="text"
                maxLength={INPUT_LIMITS.HOTKEY}
                value={localHotkey}
                onChange={(e) => setLocalHotkey(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Reveal passwords toggle */}
            <div className="space-y-1.5 flex flex-col justify-end">
              <label className="flex items-center gap-3 p-2.5 rounded-xl bg-obsidian-bg border border-obsidian-border cursor-pointer">
                <input
                  type="checkbox"
                  checked={localReveal}
                  onChange={(e) => setLocalReveal(e.target.checked)}
                  className="rounded border-obsidian-border bg-obsidian-panel text-indigo-600 focus:ring-0"
                />
                <div className="flex items-center gap-1.5">
                  <span className="text-white font-medium">Permitir Ver Contraseñas en Pantalla</span>
                  <InfoTooltip content="Si se desactiva, las contraseñas se mantienen ocultas con puntos y sólo pueden copiarse." />
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Reglas de Rotación, Papelera Híbrida, Presupuesto y Seguimiento */}
        <div className="min-w-0 space-y-5 rounded-xl border border-obsidian-border bg-obsidian-panel p-3 sm:p-5">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-indigo-400" />
            <h3 className="text-sm font-bold text-white">
              Cambio de Contraseñas, Papelera y Presupuesto
            </h3>
            <InfoTooltip content="Define cada cuántos días te avisamos para renovar contraseñas, cuándo vaciar la papelera, el límite de intentos a prospectos y tu presupuesto mensual." />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Root Emails Password Rotation */}
            <div className="space-y-1.5">
              <label className="text-obsidian-text font-medium flex items-center gap-1.5">
                <span>Aviso para Cambiar Contraseña en Correos Principales</span>
              </label>
              <select
                value={rotationRootDays}
                onChange={(e) => setRotationRootDays(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
              >
                <option value={90}>Cada 90 días (Recomendado)</option>
                <option value={180}>Cada 180 días</option>
                <option value={365}>Cada 365 días</option>
              </select>
            </div>

            {/* Secondary Accounts Password Rotation */}
            <div className="space-y-1.5">
              <label className="text-obsidian-text font-medium flex items-center gap-1.5">
                <span>Aviso para Cambiar Contraseña en Cuentas y Servicios</span>
              </label>
              <select
                value={rotationSecondaryDays}
                onChange={(e) => setRotationSecondaryDays(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
              >
                <option value={90}>Cada 90 días</option>
                <option value={180}>Cada 180 días (Recomendado)</option>
                <option value={365}>Cada 365 días</option>
              </select>
            </div>

            {/* Trash Auto-Purge Hybrid Policy */}
            <div className="space-y-1.5">
              <label className="text-obsidian-text font-medium flex items-center gap-1.5">
                <span>Vaciar Papelera Automáticamente</span>
              </label>
              <select
                value={trashRetentionDays}
                onChange={(e) => setTrashRetentionDays(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
              >
                <option value={0}>Nunca (Conservar hasta borrar manualmente)</option>
                <option value={30}>Borrar después de 30 días</option>
                <option value={60}>Borrar después de 60 días</option>
                <option value={90}>Borrar después de 90 días</option>
              </select>
            </div>

            {/* Max Follow-up Attempts before Cold Archive */}
            <div className="space-y-1.5">
              <label className="text-obsidian-text font-medium flex items-center gap-1.5">
                <span>Intentos de Seguimiento Antes de Archivar Prospecto</span>
              </label>
              <select
                value={maxFollowupAttempts}
                onChange={(e) => setMaxFollowupAttempts(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
              >
                <option value={3}>3 intentos sin respuesta (Predeterminado)</option>
                <option value={4}>4 intentos sin respuesta</option>
              </select>
            </div>

            {/* Monthly Budget Cap */}
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-obsidian-text font-medium flex items-center gap-1.5">
                <Target size={13} className="text-indigo-400" />
                <span>Presupuesto Mensual Máximo en Suscripciones (0 = Sin límite)</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  maxLength={12}
                  value={budgetCapAmount}
                  onChange={(e) => setBudgetCapAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="Ej. 5000"
                  className="flex-1 px-3.5 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
                <select
                  value={budgetCapCurrency}
                  onChange={(e) => setBudgetCapCurrency(e.target.value as 'MXN' | 'USD')}
                  className="w-28 px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-semibold"
                >
                  <option value="MXN">MXN</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Change Master Password */}
        <div className="min-w-0 space-y-4 rounded-xl border border-obsidian-border bg-obsidian-panel p-3 sm:p-5">
          <div className="flex items-center gap-2">
            <Key size={16} className="text-indigo-400" />
            <h3 className="text-sm font-bold text-white">Cambiar contraseña de acceso</h3>
            <InfoTooltip content="Cambia la contraseña de acceso con la que desbloqueas tus datos. Recuerda actualizar tu Hoja de Recuperación después del cambio." />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {newMasterPassword && (
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-obsidian-text font-medium block" htmlFor="current-access-password">
                  Contraseña actual
                </label>
                <input
                  id="current-access-password"
                  type="password"
                  autoComplete="current-password"
                  maxLength={4096}
                  value={currentMasterPassword}
                  onChange={(e) => setCurrentMasterPassword(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-obsidian-text font-medium block">
                Nueva contraseña de acceso
              </label>
              <input
                type="password"
                maxLength={INPUT_LIMITS.MASTER_PASSWORD}
                value={newMasterPassword}
                onChange={(e) => setNewMasterPassword(e.target.value)}
                placeholder="Dejar en blanco para mantener actual"
                className="w-full px-3.5 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-obsidian-text font-medium block">
                Confirmar Nueva contraseña de acceso
              </label>
              <input
                type="password"
                maxLength={INPUT_LIMITS.MASTER_PASSWORD}
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
            <span>{isSaving ? 'Guardando…' : 'Guardar cambios'}</span>
          </button>
        </div>
      </form>

      {/* Backup & Import/Export Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Import */}
        <div className="flex min-w-0 flex-col justify-between gap-3 rounded-xl border border-obsidian-border bg-obsidian-panel p-3 sm:p-5">
          <div className="flex items-center gap-2">
            <Upload size={16} className="text-emerald-400 flex-shrink-0" />
            <h3 className="text-sm font-bold text-white truncate">Importar Contraseñas</h3>
            <InfoTooltip content="Importa tus cuentas desde Bitwarden, 1Password, Google Chrome o archivos CSV/JSON." />
          </div>
          <button
            type="button"
            onClick={openImportModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-obsidian-surface hover:bg-obsidian-border border border-obsidian-border text-white text-xs font-semibold transition-all w-full"
          >
            <Upload size={14} />
            <span>Importar</span>
          </button>
        </div>

        {/* Export */}
        <div className="flex min-w-0 flex-col justify-between gap-3 rounded-xl border border-obsidian-border bg-obsidian-panel p-3 sm:p-5">
          <div className="flex items-center gap-2">
            <Download size={16} className="text-cyan-400 flex-shrink-0" />
            <h3 className="text-sm font-bold text-white truncate">Descargar Respaldo Encriptado</h3>
            <InfoTooltip content="Descarga un archivo JSON con el respaldo encriptado de tus correos, cuentas y métodos de pago." />
          </div>
          <button
            type="button"
            onClick={handleExportVault}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-obsidian-surface hover:bg-obsidian-border border border-obsidian-border text-white text-xs font-semibold transition-all w-full"
          >
            <Download size={14} />
            <span>Descargar respaldo</span>
          </button>
        </div>
      </div>

      <OperatorAuthSection />
    </div>
  );
};
