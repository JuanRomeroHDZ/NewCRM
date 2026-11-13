import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Settings, Lock, Key, Shield, Download, Upload, Check, Save,
  Palette, Clock, Target
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { InfoTooltip } from '../common/InfoTooltip';
import { INPUT_LIMITS } from '../../lib/validation';
import { OperatorAuthSection } from '../settings/OperatorAuthSection';
import { RuntimeConfigSection } from '../settings/RuntimeConfigSection';

export const SettingsView: React.FC = () => {
  const {
    isUnlocked, openUnlockModal, timeoutMinutes,
    clipboardClearSeconds, allowRevealPasswords, searchHotkey,
    accentColor, setAccentColor, canvasStyle, setCanvasStyle,
    openImportModal, refreshVaultStatus, showToast, triggerDataReload, systemLocale,
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
  const [maxFollowupAttempts, setMaxFollowupAttempts] = useState<number>(3);
  const [budgetCapAmount, setBudgetCapAmount] = useState<string>('0');
  const [budgetCapCurrency, setBudgetCapCurrency] = useState<string>('MXN');

  const [newMasterPassword, setNewMasterPassword] = useState('');
  const [confirmMasterPassword, setConfirmMasterPassword] = useState('');
  const [currentMasterPassword, setCurrentMasterPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [vaultSettingsLoading, setVaultSettingsLoading] = useState(true);
  const [vaultSettingsError, setVaultSettingsError] = useState<string | null>(null);
  const vaultSettingsGeneration = useRef(0);

  useEffect(() => {
    setLocalTimeout(timeoutMinutes);
    setLocalClipboard(clipboardClearSeconds);
    setLocalReveal(allowRevealPasswords);
    setLocalHotkey(searchHotkey);
    setLocalAccent(accentColor || '#6366f1');
    setLocalCanvas(canvasStyle || 'dot-grid');
  }, [timeoutMinutes, clipboardClearSeconds, allowRevealPasswords, searchHotkey, accentColor, canvasStyle]);

  const loadVaultSettings = useCallback(async () => {
    const generation = ++vaultSettingsGeneration.current;
    if (!isUnlocked) {
      setVaultSettingsLoading(false);
      setVaultSettingsError(null);
      setCurrentMasterPassword('');
      setNewMasterPassword('');
      setConfirmMasterPassword('');
      return;
    }

    setVaultSettingsLoading(true);
    setVaultSettingsError(null);
    try {
      const st = await api.getVaultStatus();
      if (generation !== vaultSettingsGeneration.current) return;
      if (typeof st.password_rotation_days_root === 'number') setRotationRootDays(st.password_rotation_days_root);
      if (typeof st.password_rotation_days_secondary === 'number') setRotationSecondaryDays(st.password_rotation_days_secondary);
      if (typeof st.max_followup_attempts === 'number') setMaxFollowupAttempts(st.max_followup_attempts);
      if (typeof st.budget_cap_amount === 'number') setBudgetCapAmount(String(st.budget_cap_amount));
      setBudgetCapCurrency(st.budget_cap_currency === 'USD' ? 'USD' : 'MXN');
    } catch (err: any) {
      if (generation === vaultSettingsGeneration.current) {
        setVaultSettingsError(err?.message || 'No se pudieron cargar los ajustes actuales.');
      }
    } finally {
      if (generation === vaultSettingsGeneration.current) setVaultSettingsLoading(false);
    }
  }, [isUnlocked]);

  useEffect(() => {
    void loadVaultSettings();
    return () => {
      vaultSettingsGeneration.current += 1;
    };
  }, [loadVaultSettings]);

  if (!isUnlocked) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center space-y-6 pt-24 animate-fadeIn">
        <div className="w-16 h-16 mx-auto rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
          <Lock size={32} aria-hidden="true" />
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

  const locale = systemLocale || 'es-MX';

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    if (vaultSettingsLoading || vaultSettingsError) {
      showToast('Espera a que se carguen tus ajustes antes de guardar.', 'warning');
      return;
    }
    setIsSaving(true);
    try {
      const capNum = budgetCapAmount.trim() === '' ? 0 : Number(budgetCapAmount);
      if (!Number.isFinite(capNum) || capNum < 0 || capNum > INPUT_LIMITS.BUDGET_CAP) {
        showToast(`Ingresa un presupuesto entre 0 y ${INPUT_LIMITS.BUDGET_CAP.toLocaleString(locale)}.`, 'error');
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
        max_followup_attempts: maxFollowupAttempts,
        budget_cap_amount: capNum,
        budget_cap_currency: budgetCapCurrency,
      };

      if (newMasterPassword) {
        if (newMasterPassword.length < 8) {
          showToast('La nueva contraseña debe tener al menos 8 caracteres.', 'error');
          return;
        }
        if (!currentMasterPassword) {
          showToast('Ingresa tu contraseña actual para confirmar el cambio.', 'error');
          return;
        }
        if (newMasterPassword !== confirmMasterPassword) {
          showToast('Las contraseñas de acceso no coinciden.', 'error');
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
      showToast(err?.message || 'Error al guardar ajustes.', 'error');
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
      a.download = `lessso-respaldo-cifrado-${new Date().toISOString().split('T')[0]}.json`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('Respaldo encriptado descargado exitosamente.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'No se pudo descargar el respaldo.', 'error');
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

  const currencySelectOptions = ['MXN', 'USD'];

  return (
    <div className="mx-auto max-w-4xl min-w-0 space-y-5 p-3 sm:space-y-7 sm:p-8 animate-fadeIn">
      <div className="flex items-center gap-2 min-w-0">
        <Settings className="text-indigo-400 flex-shrink-0" size={18} aria-hidden="true" />
        <h2 className="text-base font-bold text-white tracking-tight">
          Preferencias
        </h2>
        <InfoTooltip
          title="Preferencias"
          content="Apariencia, acceso, seguridad, presupuesto y mapa."
        />
      </div>

      {vaultSettingsLoading && (
        <p role="status" className="rounded-lg border border-obsidian-border bg-obsidian-panel px-3 py-2 text-xs text-obsidian-muted">
          Cargando tus ajustes…
        </p>
      )}
      {vaultSettingsError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          <span>No se cargaron tus ajustes. Para evitar reemplazarlos con valores iniciales, vuelve a intentarlo antes de guardar.</span>
          <button type="button" onClick={() => void loadVaultSettings()} className="shrink-0 font-semibold underline underline-offset-2 hover:text-white">
            Reintentar
          </button>
        </div>
      )}

      <form onSubmit={handleSavePreferences} className="space-y-6">
        {/* Visual Customization (Notion & Obsidian aesthetics) */}
        <div className="min-w-0 space-y-4 rounded-xl border border-obsidian-border bg-obsidian-panel p-3 sm:p-5">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Palette size={16} className="text-indigo-400" aria-hidden="true" />
            <span>Apariencia</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Accent color picker */}
            <div className="space-y-2">
              <span className="text-obsidian-text font-medium block">
                Color Principal de la Interfaz
              </span>
              <div className="flex flex-wrap items-center gap-2.5" role="group" aria-label="Color principal de la interfaz">
                {colorOptions.map((opt) => (
                  <button
                    key={opt.color}
                    type="button"
                    aria-label={`Seleccionar color ${opt.name}`}
                    aria-pressed={localAccent === opt.color}
                    onClick={() => setLocalAccent(opt.color)}
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                      localAccent === opt.color ? 'ring-2 ring-white ring-offset-2 ring-offset-obsidian-panel scale-110' : 'opacity-75 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: opt.color }}
                    title={opt.name}
                  >
                    {localAccent === opt.color && <Check size={15} className="text-white" aria-hidden="true" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Canvas pattern */}
            <div className="space-y-1.5">
                <label htmlFor="canvas-style-select" className="text-obsidian-text font-medium block">
                Fondo de la interfaz
              </label>
              <select
                id="canvas-style-select"
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
            <Shield size={16} className="text-indigo-400" aria-hidden="true" />
            <h3 className="text-sm font-bold text-white">Sesión y Portapapeles</h3>
            <InfoTooltip content="Elige cuántos minutos permanece desbloqueada la sesión y cuántos segundos dura una contraseña copiada antes de borrarse del portapapeles." />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Auto-Lock timer */}
            <div className="space-y-1.5">
              <label htmlFor="vault-timeout-select" className="text-obsidian-text font-medium block">
                Bloquear Automáticamente por Inactividad
              </label>
              <select
                id="vault-timeout-select"
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
              <label htmlFor="clipboard-clear-select" className="text-obsidian-text font-medium block">
                Borrar Contraseña Copiada del Portapapeles
              </label>
              <select
                id="clipboard-clear-select"
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
              <label htmlFor="search-hotkey-input" className="text-obsidian-text font-medium block">
                Atajo de Teclado del Buscador Rápido
              </label>
              <input
                id="search-hotkey-input"
                type="text"
                maxLength={INPUT_LIMITS.HOTKEY}
                value={localHotkey}
                onChange={(e) => setLocalHotkey(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Reveal passwords toggle */}
            <div className="space-y-1.5 flex flex-col justify-end">
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-obsidian-bg border border-obsidian-border">
                <input
                  id="reveal-passwords-checkbox"
                  type="checkbox"
                  checked={localReveal}
                  onChange={(e) => setLocalReveal(e.target.checked)}
                  className="rounded border-obsidian-border bg-obsidian-panel text-indigo-600 focus:ring-0"
                />
                <label htmlFor="reveal-passwords-checkbox" className="text-white font-medium cursor-pointer flex-1">
                  Permitir Ver Contraseñas en Pantalla
                </label>
                <InfoTooltip content="Si se desactiva, las contraseñas se mantienen ocultas con puntos y sólo pueden copiarse." />
              </div>
            </div>
          </div>
        </div>

        {/* Reglas de Rotación, Papelera Híbrida, Presupuesto y Seguimiento */}
        <div className="min-w-0 space-y-5 rounded-xl border border-obsidian-border bg-obsidian-panel p-3 sm:p-5">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-indigo-400" aria-hidden="true" />
            <h3 className="text-sm font-bold text-white">
              Cambio de Contraseñas, Papelera y Presupuesto
            </h3>
            <InfoTooltip content="Define cada cuántos días te avisamos para renovar contraseñas, cuándo vaciar la papelera, el límite de intentos a prospectos y tu presupuesto mensual." />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Root Emails Password Rotation */}
            <div className="space-y-1.5">
              <label htmlFor="rotation-root-select" className="text-obsidian-text font-medium flex items-center gap-1.5">
                <span>Aviso para Cambiar Contraseña en Correos Principales</span>
              </label>
              <select
                id="rotation-root-select"
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
              <label htmlFor="rotation-secondary-select" className="text-obsidian-text font-medium flex items-center gap-1.5">
                <span>Aviso para Cambiar Contraseña en Cuentas y Servicios</span>
              </label>
              <select
                id="rotation-secondary-select"
                value={rotationSecondaryDays}
                onChange={(e) => setRotationSecondaryDays(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
              >
                <option value={90}>Cada 90 días</option>
                <option value={180}>Cada 180 días (Recomendado)</option>
                <option value={365}>Cada 365 días</option>
              </select>
            </div>

            {/* Max Follow-up Attempts before Cold Archive */}
            <div className="space-y-1.5">
              <label htmlFor="max-followup-select" className="text-obsidian-text font-medium flex items-center gap-1.5">
                <span>Intentos de Seguimiento Antes de Archivar Prospecto</span>
              </label>
              <select
                id="max-followup-select"
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
              <label htmlFor="budget-cap-amount" className="text-obsidian-text font-medium flex items-center gap-1.5">
                <Target size={13} className="text-indigo-400" aria-hidden="true" />
                <span>Presupuesto Mensual Máximo en Suscripciones (0 = Sin límite)</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="budget-cap-amount"
                  type="text"
                  inputMode="decimal"
                  maxLength={12}
                  value={budgetCapAmount}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9.]/g, '');
                    const decimal = value.indexOf('.');
                    setBudgetCapAmount(decimal < 0 ? value : `${value.slice(0, decimal + 1)}${value.slice(decimal + 1).replace(/\./g, '')}`);
                  }}
                  placeholder="Ej. 5000"
                  className="min-w-0 flex-1 px-3.5 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
                <label htmlFor="budget-cap-currency" className="sr-only">
                  Moneda del presupuesto mensual
                </label>
                <select
                  id="budget-cap-currency"
                  value={budgetCapCurrency}
                  onChange={(e) => setBudgetCapCurrency(e.target.value)}
                  className="w-20 shrink-0 px-2 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-semibold sm:w-28 sm:px-3"
                >
                  {currencySelectOptions.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Change Master Password */}
        <div className="min-w-0 space-y-4 rounded-xl border border-obsidian-border bg-obsidian-panel p-3 sm:p-5">
          <div className="flex items-center gap-2">
            <Key size={16} className="text-indigo-400" aria-hidden="true" />
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
                  maxLength={INPUT_LIMITS.MASTER_PASSWORD}
                  value={currentMasterPassword}
                  onChange={(e) => setCurrentMasterPassword(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <label htmlFor="new-access-password" className="text-obsidian-text font-medium block">
                Nueva contraseña de acceso
              </label>
              <input
                id="new-access-password"
                type="password"
                maxLength={INPUT_LIMITS.MASTER_PASSWORD}
                value={newMasterPassword}
                onChange={(e) => {
                  setNewMasterPassword(e.target.value);
                  if (!e.target.value) {
                    setCurrentMasterPassword('');
                    setConfirmMasterPassword('');
                  }
                }}
                placeholder="Dejar en blanco para mantener actual"
                className="w-full px-3.5 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="confirm-access-password" className="text-obsidian-text font-medium block">
                Confirmar Nueva contraseña de acceso
              </label>
              <input
                id="confirm-access-password"
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
            disabled={isSaving || vaultSettingsLoading || Boolean(vaultSettingsError)}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50"
          >
            <Save size={14} aria-hidden="true" />
            <span>{isSaving ? 'Guardando...' : 'Guardar cambios'}</span>
          </button>
        </div>
      </form>

      <RuntimeConfigSection />

      {/* Backup & Import/Export Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Import */}
        <div className="flex min-w-0 flex-col justify-between gap-3 rounded-xl border border-obsidian-border bg-obsidian-panel p-3 sm:p-5">
          <div className="flex items-center gap-2">
            <Upload size={16} className="text-emerald-400 flex-shrink-0" aria-hidden="true" />
            <h3 className="text-sm font-bold text-white truncate">Importar Contraseñas</h3>
            <InfoTooltip content="Importa tus cuentas desde Bitwarden, 1Password, Google Chrome o archivos CSV/JSON." />
          </div>
          <button
            type="button"
            onClick={openImportModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-obsidian-surface hover:bg-obsidian-border border border-obsidian-border text-white text-xs font-semibold transition-all w-full"
          >
            <Upload size={14} aria-hidden="true" />
            <span>Importar</span>
          </button>
        </div>

        {/* Export */}
        <div className="flex min-w-0 flex-col justify-between gap-3 rounded-xl border border-obsidian-border bg-obsidian-panel p-3 sm:p-5">
          <div className="flex items-center gap-2">
            <Download size={16} className="text-cyan-400 flex-shrink-0" aria-hidden="true" />
            <h3 className="text-sm font-bold text-white truncate">Descargar Respaldo Encriptado</h3>
            <InfoTooltip content="Descarga un archivo JSON con el respaldo encriptado de tus correos, cuentas y métodos de pago." />
          </div>
          <button
            type="button"
            onClick={handleExportVault}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-obsidian-surface hover:bg-obsidian-border border border-obsidian-border text-white text-xs font-semibold transition-all w-full"
          >
            <Download size={14} aria-hidden="true" />
            <span>Descargar respaldo</span>
          </button>
        </div>
      </div>

      <OperatorAuthSection />
    </div>
  );
};
