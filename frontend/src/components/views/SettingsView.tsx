import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Settings, Lock, Key, Shield, Download, Upload, Save,
  Palette, Clock, Target
} from 'lucide-react';
import { SectionType, useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { InfoTooltip } from '../common/InfoTooltip';
import { INPUT_LIMITS } from '../../lib/validation';
import { OperatorAuthSection } from '../settings/OperatorAuthSection';
import { RuntimeConfigSection } from '../settings/RuntimeConfigSection';

const sectionTargets: Partial<Record<SectionType, string>> = {
  settings_appearance: 'settings-appearance',
  settings_session: 'settings-session',
  settings_limits: 'settings-limits',
  settings_access: 'settings-access',
  settings_network: 'settings-network',
  settings_writeups: 'settings-writeups',
  settings_tools: 'settings-tools',
  settings_backup: 'settings-backup',
  settings_team: 'settings-team',
};

export const SettingsView: React.FC = () => {
  const {
    activeSection, setActiveSection, isUnlocked, openUnlockModal, timeoutMinutes,
    clipboardClearSeconds, allowRevealPasswords, searchHotkey,
    accentColor, setAccentColor, setCanvasStyle,
    openImportModal, openEnvExport, openEmergencyKit, openPasswordGen, refreshVaultStatus, showToast, triggerDataReload, systemLocale,
  } = useVault();

  const [localTimeout, setLocalTimeout] = useState(timeoutMinutes);
  const [localClipboard, setLocalClipboard] = useState(clipboardClearSeconds);
  const [localReveal, setLocalReveal] = useState(allowRevealPasswords);
  const [localHotkey, setLocalHotkey] = useState(searchHotkey);
  const [localAccent, setLocalAccent] = useState(accentColor || '#0F766E');

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

  const scrollSelection = useRef(false);
  const navigationUntil = useRef(0);

  useEffect(() => {
    if (scrollSelection.current) { scrollSelection.current = false; return; }
    const targetId = sectionTargets[activeSection];
    if (!targetId) return;
    navigationUntil.current = Date.now() + 1000;
    window.requestAnimationFrame(() => {
      const target = document.getElementById(targetId);
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target.focus({ preventScroll: true });
    });
  }, [activeSection, isUnlocked]);

  useEffect(() => {
    if (!isUnlocked) return;
    const main = document.getElementById('settings-appearance')?.closest('main');
    if (!main) return;
    const update = () => {
      if (Date.now() < navigationUntil.current) return;
      const threshold = main.getBoundingClientRect().top + 80;
      const entries = Object.entries(sectionTargets) as [SectionType, string][];
      let current: SectionType = 'settings_appearance';
      for (const [section, id] of entries) {
        const element = document.getElementById(id);
        if (element && element.getBoundingClientRect().top <= threshold) current = section;
      }
      if (main.scrollTop + main.clientHeight >= main.scrollHeight - 4) current = 'settings_team';
      if (current !== activeSection) { scrollSelection.current = true; setActiveSection(current); }
    };
    main.addEventListener('scroll', update, { passive: true });
    return () => main.removeEventListener('scroll', update);
  }, [activeSection, isUnlocked, setActiveSection]);

  useEffect(() => {
    setLocalTimeout(timeoutMinutes);
    setLocalClipboard(clipboardClearSeconds);
    setLocalReveal(allowRevealPasswords);
    setLocalHotkey(searchHotkey);
    setLocalAccent(accentColor || '#0F766E');
  }, [timeoutMinutes, clipboardClearSeconds, allowRevealPasswords, searchHotkey, accentColor]);

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
        <div className="w-16 h-16 mx-auto rounded-2xl bg-obsidian-surface border border-obsidian-border flex items-center justify-center text-obsidian-muted">
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
          className="ui-action-primary"
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
        canvas_style: 'plain',
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
      setCanvasStyle('plain');
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

  const currencySelectOptions = ['MXN', 'USD'];

  return (
    <div className="mx-auto max-w-4xl min-w-0 space-y-4 p-3 sm:space-y-4 sm:p-4 animate-fadeIn">
      <div className="flex items-center gap-2 min-w-0">
        <Settings className="text-obsidian-muted flex-shrink-0" size={18} aria-hidden="true" />
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
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs text-rose-200">
          <span>No se cargaron tus ajustes. Para evitar reemplazarlos con valores iniciales, vuelve a intentarlo antes de guardar.</span>
          <button type="button" onClick={() => void loadVaultSettings()} className="ui-action-secondary shrink-0">
            Reintentar
          </button>
        </div>
      )}

      <form onSubmit={handleSavePreferences} className="space-y-4 sm:space-y-4">
        {/* Visual Customization (Notion & Obsidian aesthetics) */}
        <section id="settings-appearance" tabIndex={-1} style={{ outline: activeSection === 'settings_appearance' ? '2px solid var(--brand-accent, #0F766E)' : undefined, outlineOffset: '2px' }} className="min-w-0 scroll-mt-4 space-y-2 border-b border-obsidian-border pb-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Palette size={16} className="text-obsidian-muted" aria-hidden="true" />
            <span>Apariencia</span>
          </h3>
          <p className="text-xs leading-5 text-obsidian-muted">La interfaz usa superficies neutras; el lienzo de mapas y pizarras conserva sus propias herramientas de color.</p>
        </section>

        {/* Security Parameters */}
        <div id="settings-session" tabIndex={-1} style={{ outline: activeSection === 'settings_session' ? '2px solid var(--brand-accent, #0F766E)' : undefined, outlineOffset: '2px' }} className="min-w-0 scroll-mt-4 space-y-4 rounded-xl border border-obsidian-border bg-obsidian-panel p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent sm:p-4">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-obsidian-muted" aria-hidden="true" />
            <h3 className="text-sm font-bold text-white">Sesión y Portapapeles</h3>
            <InfoTooltip content="Elige cuántos minutos permanece desbloqueada la sesión y cuántos segundos dura una contraseña copiada antes de borrarse del portapapeles." />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Auto-Lock timer */}
            <div className="space-y-2">
              <label htmlFor="vault-timeout-select" className="text-obsidian-text font-medium block">
                Bloquear Automáticamente por Inactividad
              </label>
              <select
                id="vault-timeout-select"
                value={localTimeout}
                onChange={(e) => setLocalTimeout(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg min-h-11 bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-obsidian-accent"
              >
                <option value={1}>1 minuto</option>
                <option value={5}>5 minutos</option>
                <option value={10}>10 minutos (Recomendado)</option>
                <option value={30}>30 minutos</option>
                <option value={60}>1 hora</option>
                <option value={120}>2 horas</option>
                <option value={240}>4 horas</option>
                <option value={480}>8 horas (jornada completa)</option>
              </select>
              {localTimeout > 60 && (
                <p role="note" className="text-[11px] leading-relaxed text-obsidian-muted">
                  Un plazo más largo evita pedir la contraseña tan seguido, pero deja la bóveda abierta más tiempo. Aplica al próximo desbloqueo.
                </p>
              )}
            </div>

            {/* Clipboard clear timer */}
            <div className="space-y-2">
              <label htmlFor="clipboard-clear-select" className="text-obsidian-text font-medium block">
                Borrar Contraseña Copiada del Portapapeles
              </label>
              <select
                id="clipboard-clear-select"
                value={localClipboard}
                onChange={(e) => setLocalClipboard(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg min-h-11 bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-obsidian-accent"
              >
                <option value={10}>A los 10 segundos</option>
                <option value={20}>A los 20 segundos</option>
                <option value={30}>A los 30 segundos (Predeterminado)</option>
                <option value={60}>A los 60 segundos</option>
              </select>
            </div>

            {/* Search Hotkey */}
            <div className="space-y-2">
              <label htmlFor="search-hotkey-input" className="text-obsidian-text font-medium block">
                Atajo de Teclado del Buscador Rápido
              </label>
              <input
                id="search-hotkey-input"
                type="text"
                maxLength={INPUT_LIMITS.HOTKEY}
                value={localHotkey}
                onChange={(e) => setLocalHotkey(e.target.value)}
                className="w-full px-3 py-2 rounded-lg min-h-11 bg-obsidian-bg border border-obsidian-border text-white font-mono text-xs focus:outline-none focus:border-obsidian-accent"
              />
            </div>

            {/* Reveal passwords toggle */}
            <div className="space-y-2 flex flex-col justify-end">
              <div className="flex items-center gap-3 border-t border-obsidian-border pt-3">
                <input
                  id="reveal-passwords-checkbox"
                  type="checkbox"
                  checked={localReveal}
                  onChange={(e) => setLocalReveal(e.target.checked)}
                  className="rounded border-obsidian-border bg-obsidian-panel text-obsidian-accent focus:ring-0"
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
        <div id="settings-limits" tabIndex={-1} style={{ outline: activeSection === 'settings_limits' ? '2px solid var(--brand-accent, #0F766E)' : undefined, outlineOffset: '2px' }} className="min-w-0 scroll-mt-4 space-y-5 rounded-xl border border-obsidian-border bg-obsidian-panel p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent sm:p-6">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-obsidian-muted" aria-hidden="true" />
            <h3 className="text-sm font-bold text-white">
              Recordatorios y límites
            </h3>
            <InfoTooltip content="Define los avisos de cambio de contraseña, los intentos de seguimiento y el gasto mensual máximo en suscripciones." />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Root Emails Password Rotation */}
            <div className="space-y-2">
              <label htmlFor="rotation-root-select" className="text-obsidian-text font-medium flex items-center gap-2">
                <span>Aviso para Cambiar Contraseña en Correos Principales</span>
              </label>
              <select
                id="rotation-root-select"
                value={rotationRootDays}
                onChange={(e) => setRotationRootDays(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg min-h-11 bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-obsidian-accent"
              >
                <option value={90}>Cada 90 días (Recomendado)</option>
                <option value={180}>Cada 180 días</option>
                <option value={365}>Cada 365 días</option>
              </select>
            </div>

            {/* Secondary Accounts Password Rotation */}
            <div className="space-y-2">
              <label htmlFor="rotation-secondary-select" className="text-obsidian-text font-medium flex items-center gap-2">
                <span>Aviso para Cambiar Contraseña en Cuentas y Servicios</span>
              </label>
              <select
                id="rotation-secondary-select"
                value={rotationSecondaryDays}
                onChange={(e) => setRotationSecondaryDays(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg min-h-11 bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-obsidian-accent"
              >
                <option value={90}>Cada 90 días</option>
                <option value={180}>Cada 180 días (Recomendado)</option>
                <option value={365}>Cada 365 días</option>
              </select>
            </div>

            {/* Max Follow-up Attempts before Cold Archive */}
            <div className="space-y-2">
              <label htmlFor="max-followup-select" className="text-obsidian-text font-medium flex items-center gap-2">
                <span>Intentos de Seguimiento Antes de Archivar Prospecto</span>
              </label>
              <select
                id="max-followup-select"
                value={maxFollowupAttempts}
                onChange={(e) => setMaxFollowupAttempts(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg min-h-11 bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-obsidian-accent"
              >
                <option value={3}>3 intentos sin respuesta (Predeterminado)</option>
                <option value={4}>4 intentos sin respuesta</option>
              </select>
            </div>

            {/* Monthly Budget Cap */}
            <div className="min-w-0 max-w-md space-y-2">
              <label htmlFor="budget-cap-amount" className="text-obsidian-text font-medium flex items-center gap-2">
                <Target size={16} className="text-obsidian-muted shrink-0" aria-hidden="true" />
                <span>Límite mensual</span>
                <InfoTooltip content="Máximo para el gasto en suscripciones. Usa 0 para dejarlo sin límite." />
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
                  className="min-w-0 min-h-11 flex-1 px-3 py-2 rounded-lg bg-obsidian-bg border border-obsidian-border text-white font-mono text-xs focus:outline-none focus:border-obsidian-accent"
                />
                <label htmlFor="budget-cap-currency" className="sr-only">
                  Moneda del presupuesto mensual
                </label>
                <select
                  id="budget-cap-currency"
                  value={budgetCapCurrency}
                  onChange={(e) => setBudgetCapCurrency(e.target.value)}
                  className="w-24 min-h-11 shrink-0 px-2 py-2 rounded-lg bg-obsidian-bg border border-obsidian-border text-white font-semibold sm:w-28 sm:px-3"
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
        <div id="settings-access" tabIndex={-1} style={{ outline: activeSection === 'settings_access' ? '2px solid var(--brand-accent, #0F766E)' : undefined, outlineOffset: '2px' }} className="min-w-0 scroll-mt-4 space-y-4 rounded-xl border border-obsidian-border bg-obsidian-panel p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent sm:p-6">
          <div className="flex items-center gap-2">
            <Key size={16} className="text-obsidian-muted" aria-hidden="true" />
            <h3 className="text-sm font-bold text-white">Cambiar contraseña de acceso</h3>
            <InfoTooltip content="Cambia la contraseña de acceso con la que desbloqueas tus datos. Recuerda actualizar tu Hoja de Recuperación después del cambio." />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {newMasterPassword && (
              <div className="space-y-2 md:col-span-2">
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
                  className="w-full px-3 py-2 rounded-lg min-h-11 bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-obsidian-accent"
                />
              </div>
            )}
            <div className="space-y-2">
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
                className="w-full px-3 py-2 rounded-lg min-h-11 bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-obsidian-accent"
              />
            </div>

            <div className="space-y-2">
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
                className="w-full px-3 py-2 rounded-lg min-h-11 bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-obsidian-accent"
              />
            </div>
          </div>
        </div>

        {/* [Acción principal] Guardar los cambios de las preferencias. */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSaving || vaultSettingsLoading || Boolean(vaultSettingsError)}
            className="ui-action-primary"
          >
            <Save size={16} aria-hidden="true" />
            <span>{isSaving ? 'Guardando...' : 'Guardar cambios'}</span>
          </button>
        </div>
      </form>

      <section id="settings-network" tabIndex={-1} style={{ outline: activeSection === 'settings_network' ? '2px solid var(--brand-accent, #0F766E)' : undefined, outlineOffset: '2px' }} className="scroll-mt-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent">
        <RuntimeConfigSection />
      </section>

      <section id="settings-tools" tabIndex={-1} style={{ outline: activeSection === 'settings_tools' ? '2px solid var(--brand-accent, #0F766E)' : undefined, outlineOffset: '2px' }} aria-labelledby="settings-tools-heading" className="scroll-mt-4 rounded-xl border border-obsidian-border bg-obsidian-panel p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent">
        <h3 id="settings-tools-heading" className="text-sm font-bold text-white">Herramientas</h3>
        {/* [Acción secundaria] Abrir las herramientas sin cambiar datos directamente. */}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={openEnvExport} className="ui-action-secondary">Exportar configuración</button>
          <button type="button" onClick={openEmergencyKit} className="ui-action-secondary">Hoja de recuperación</button>
          <button type="button" onClick={openPasswordGen} className="ui-action-secondary">Generar contraseña</button>
        </div>
      </section>

      {/* Backup & Import/Export Section */}
      <div id="settings-backup" tabIndex={-1} style={{ outline: activeSection === 'settings_backup' ? '2px solid var(--brand-accent, #0F766E)' : undefined, outlineOffset: '2px' }} className="scroll-mt-4 divide-y divide-obsidian-border border-y border-obsidian-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent">
        {/* Import */}
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-4">
          <div className="flex min-w-0 items-center gap-2">
            <Upload size={18} className="text-obsidian-muted flex-shrink-0" aria-hidden="true" />
            <h3 className="min-w-0 text-sm font-semibold text-white">Importar contraseñas</h3>
            <InfoTooltip content="Importa tus cuentas desde Bitwarden, 1Password, Google Chrome o archivos CSV/JSON." />
          </div>
          <button
            type="button"
            onClick={openImportModal}
            className="ui-action-secondary"
          >
            <Upload size={16} aria-hidden="true" />
            <span>Importar</span>
          </button>
        </div>

        {/* Export */}
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-4">
          <div className="flex min-w-0 items-center gap-2">
            <Download size={18} className="text-obsidian-muted flex-shrink-0" aria-hidden="true" />
            <h3 className="min-w-0 text-sm font-semibold text-white">Descargar respaldo encriptado</h3>
            <InfoTooltip content="Descarga un archivo JSON con el respaldo encriptado de tus correos, cuentas y métodos de pago." />
          </div>
          <button
            type="button"
            onClick={handleExportVault}
            className="ui-action-secondary"
          >
            <Download size={16} aria-hidden="true" />
            <span>Descargar respaldo</span>
          </button>
        </div>
      </div>

      <section id="settings-team" tabIndex={-1} style={{ outline: activeSection === 'settings_team' ? '2px solid var(--brand-accent, #0F766E)' : undefined, outlineOffset: '2px' }} className="scroll-mt-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent">
        <OperatorAuthSection />
      </section>
    </div>
  );
};
