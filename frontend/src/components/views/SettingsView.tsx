import React, { useState, useEffect } from 'react';
import {
  Settings, Lock, Key, Shield, Download, Upload, Check, Save,
  Palette, Clock, Target, Globe, MapPin, FileText, Plus, Trash2
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { InfoTooltip } from '../common/InfoTooltip';
import { INPUT_LIMITS } from '../../lib/validation';
import { OperatorAuthSection } from '../settings/OperatorAuthSection';
import { RuntimeCurrencyOption, RuntimeMapZone } from '../../types';

export const SettingsView: React.FC = () => {
  const {
    isUnlocked, openUnlockModal, timeoutMinutes,
    clipboardClearSeconds, allowRevealPasswords, searchHotkey,
    accentColor, setAccentColor, canvasStyle, setCanvasStyle,
    openImportModal, refreshVaultStatus, showToast, triggerDataReload,
    supportedCurrencies, baseCurrency, systemLocale,
    runtimeConfig, refreshRuntimeConfig,
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
  const [budgetCapCurrency, setBudgetCapCurrency] = useState<string>(baseCurrency || 'MXN');

  const [newMasterPassword, setNewMasterPassword] = useState('');
  const [confirmMasterPassword, setConfirmMasterPassword] = useState('');
  const [currentMasterPassword, setCurrentMasterPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Dynamic Runtime System Config Editor State
  const [sysCurrencies, setSysCurrencies] = useState<RuntimeCurrencyOption[]>([]);
  const [sysBaseCurrency, setSysBaseCurrency] = useState<string>('MXN');
  const [sysPairBase, setSysPairBase] = useState<string>('USD');
  const [sysPairTarget, setSysPairTarget] = useState<string>('MXN');
  const [sysLocale, setSysLocale] = useState<string>('es-MX');

  const [newCurrCode, setNewCurrCode] = useState('');
  const [newCurrName, setNewCurrName] = useState('');
  const [newCurrSymbol, setNewCurrSymbol] = useState('$');

  const [mapDefaultCity, setMapDefaultCity] = useState('');
  const [mapDefaultZone, setMapDefaultZone] = useState('');
  const [mapDefaultSector, setMapDefaultSector] = useState('');
  const [mapCenterLat, setMapCenterLat] = useState('0');
  const [mapCenterLon, setMapCenterLon] = useState('0');
  const [mapZoom, setMapZoom] = useState('13');
  const [sysMapZones, setSysMapZones] = useState<RuntimeMapZone[]>([]);

  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneColonias, setNewZoneColonias] = useState('');

  const [writeupOrgName, setWriteupOrgName] = useState('');
  const [writeupWatermark, setWriteupWatermark] = useState('');
  const [savingRuntime, setSavingRuntime] = useState(false);

  useEffect(() => {
    setLocalTimeout(timeoutMinutes);
    setLocalClipboard(clipboardClearSeconds);
    setLocalReveal(allowRevealPasswords);
    setLocalHotkey(searchHotkey);
    setLocalAccent(accentColor || '#6366f1');
    setLocalCanvas(canvasStyle || 'dot-grid');
  }, [timeoutMinutes, clipboardClearSeconds, allowRevealPasswords, searchHotkey, accentColor, canvasStyle]);

  useEffect(() => {
    setBudgetCapCurrency((prev) => prev || baseCurrency || 'MXN');
  }, [baseCurrency]);

  useEffect(() => {
    if (!runtimeConfig) return;
    setSysCurrencies(runtimeConfig.currencies || []);
    setSysBaseCurrency(runtimeConfig.currency_config?.base_currency || baseCurrency || 'MXN');
    setSysPairBase(runtimeConfig.currency_config?.exchange_pair?.base || 'USD');
    setSysPairTarget(runtimeConfig.currency_config?.exchange_pair?.target || 'MXN');
    setSysLocale(runtimeConfig.currency_config?.locale || 'es-MX');

    setMapDefaultCity(runtimeConfig.map_defaults?.default_city || '');
    setMapDefaultZone(runtimeConfig.map_defaults?.default_zone || '');
    setMapDefaultSector(runtimeConfig.map_defaults?.default_sector || '');
    setMapCenterLat(String(runtimeConfig.map_defaults?.center?.[0] ?? 0));
    setMapCenterLon(String(runtimeConfig.map_defaults?.center?.[1] ?? 0));
    setMapZoom(String(runtimeConfig.map_defaults?.zoom ?? 13));
    setSysMapZones(runtimeConfig.map_zones || []);

    setWriteupOrgName(runtimeConfig.writeup_defaults?.organization_name || '');
    setWriteupWatermark(runtimeConfig.writeup_defaults?.watermark_default || '');
  }, [runtimeConfig, baseCurrency]);

  useEffect(() => {
    if (!isUnlocked) return;
    api.getVaultStatus()
      .then((st) => {
        if (typeof st.password_rotation_days_root === 'number') setRotationRootDays(st.password_rotation_days_root);
        if (typeof st.password_rotation_days_secondary === 'number') setRotationSecondaryDays(st.password_rotation_days_secondary);
        if (typeof st.trash_retention_days === 'number') setTrashRetentionDays(st.trash_retention_days);
        if (typeof st.max_followup_attempts === 'number') setMaxFollowupAttempts(st.max_followup_attempts);
        if (typeof st.budget_cap_amount === 'number') setBudgetCapAmount(String(st.budget_cap_amount));
        if (typeof st.budget_cap_currency === 'string' && st.budget_cap_currency.trim()) {
          setBudgetCapCurrency(st.budget_cap_currency);
        }
      })
      .catch((err: any) => {
        showToast(err?.message || 'No se pudieron cargar los ajustes actuales de la bóveda.', 'error');
      });
  }, [isUnlocked, showToast]);

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
        trash_retention_days: trashRetentionDays,
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
      showToast(err.message || 'Error al guardar ajustes.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetBaseCurrency = (code: string) => {
    setSysBaseCurrency(code);
    setSysCurrencies((prev) => prev.map((c) => ({ ...c, is_base: c.code === code })));
  };

  const handleAddCurrency = () => {
    const code = newCurrCode.trim().toUpperCase();
    const name = newCurrName.trim();
    const symbol = newCurrSymbol.trim() || '$';
    if (!/^[A-Z]{3,5}$/.test(code)) {
      showToast('El código de moneda debe tener entre 3 y 5 letras (ej. EUR, COP).', 'error');
      return;
    }
    if (!name) {
      showToast('Ingresa el nombre descriptivo de la moneda.', 'error');
      return;
    }
    if (sysCurrencies.some((c) => c.code === code)) {
      showToast(`La moneda ${code} ya está registrada.`, 'error');
      return;
    }
    setSysCurrencies((prev) => [...prev, { code, name, symbol, is_base: false }]);
    setNewCurrCode('');
    setNewCurrName('');
  };

  const handleRemoveCurrency = (code: string) => {
    if (sysCurrencies.length <= 1 || code === sysBaseCurrency) {
      showToast('No puedes eliminar la moneda base activa.', 'error');
      return;
    }
    setSysCurrencies((prev) => prev.filter((c) => c.code !== code));
  };

  const handleAddZone = () => {
    const zoneName = newZoneName.trim();
    if (!zoneName) {
      showToast('Ingresa el nombre de la zona geográfica.', 'error');
      return;
    }
    const slug = zoneName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || `zona_${Date.now()}`;
    if (sysMapZones.some((z) => z.slug === slug)) {
      showToast('Ya existe una zona con un identificador similar.', 'error');
      return;
    }
    const lat = Number(mapCenterLat) || 0;
    const lon = Number(mapCenterLon) || 0;
    const zoom = Number(mapZoom) || 13;
    const colonias = newZoneColonias
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    setSysMapZones((prev) => [
      ...prev,
      {
        slug,
        zone: zoneName,
        center: [lat, lon],
        zoom,
        bbox: {
          min_lat: Number((lat - 0.05).toFixed(4)),
          max_lat: Number((lat + 0.05).toFixed(4)),
          min_lon: Number((lon - 0.05).toFixed(4)),
          max_lon: Number((lon + 0.05).toFixed(4)),
        },
        colonias,
      },
    ]);
    setNewZoneName('');
    setNewZoneColonias('');
  };

  const handleUpdateZoneColonias = (slug: string, rawColonias: string) => {
    const colonias = rawColonias
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    setSysMapZones((prev) =>
      prev.map((z) => (z.slug === slug ? { ...z, colonias } : z))
    );
  };

  const handleRemoveZone = (slug: string) => {
    setSysMapZones((prev) => prev.filter((z) => z.slug !== slug));
  };

  const handleSaveRuntimeConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sysCurrencies.length === 0) {
      showToast('Debe existir al menos una moneda configurada.', 'error');
      return;
    }
    const parsedLat = Number(mapCenterLat);
    const parsedLon = Number(mapCenterLon);
    const parsedZoom = Number(mapZoom);
    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLon)) {
      showToast('Las coordenadas centrales del mapa deben ser numéricas.', 'error');
      return;
    }

    setSavingRuntime(true);
    try {
      await api.updateRuntimeConfig({
        currencies: sysCurrencies.map((c) => ({
          ...c,
          is_base: c.code === sysBaseCurrency,
        })),
        currency_config: {
          base_currency: sysBaseCurrency,
          exchange_pair: {
            base: sysPairBase.trim().toUpperCase() || 'USD',
            target: sysPairTarget.trim().toUpperCase() || sysBaseCurrency,
          },
          locale: sysLocale.trim() || 'es-MX',
        },
        map_defaults: {
          default_city: mapDefaultCity.trim(),
          default_zone: mapDefaultZone.trim(),
          default_sector: mapDefaultSector.trim(),
          center: [parsedLat, parsedLon],
          zoom: Number.isFinite(parsedZoom) ? parsedZoom : 13,
          max_search_area_deg: runtimeConfig?.map_defaults?.max_search_area_deg ?? 0.5,
          full_bounds_zone_slug: runtimeConfig?.map_defaults?.full_bounds_zone_slug ?? (sysMapZones[0]?.slug || ''),
          tile_url_template: runtimeConfig?.map_defaults?.tile_url_template ?? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
          attribution: runtimeConfig?.map_defaults?.attribution ?? '© OpenStreetMap',
        },
        map_zones: sysMapZones,
        writeup_defaults: {
          organization_name: writeupOrgName.trim(),
          watermark_default: writeupWatermark.trim(),
        },
      });
      await refreshRuntimeConfig();
      triggerDataReload();
      showToast('Configuración dinámica del sistema guardada.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'No se pudo guardar la configuración del sistema.', 'error');
    } finally {
      setSavingRuntime(false);
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

  const currencySelectOptions = Array.from(
    new Set([
      ...(supportedCurrencies.length > 0 ? supportedCurrencies.map((c) => c.code) : ['MXN', 'USD']),
      budgetCapCurrency,
    ].filter(Boolean))
  );

  return (
    <div className="mx-auto max-w-4xl min-w-0 space-y-5 p-3 sm:space-y-7 sm:p-8 animate-fadeIn">
      <div className="flex items-center gap-2 min-w-0">
        <Settings className="text-indigo-400 flex-shrink-0" size={18} aria-hidden="true" />
        <h2 className="text-base font-bold text-white tracking-tight">
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
                Fondo del Mapa de Conexiones
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

            {/* Trash Auto-Purge Hybrid Policy */}
            <div className="space-y-1.5">
              <label htmlFor="trash-retention-settings-select" className="text-obsidian-text font-medium flex items-center gap-1.5">
                <span>Vaciar Papelera Automáticamente</span>
              </label>
              <select
                id="trash-retention-settings-select"
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
                  onChange={(e) => setBudgetCapAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="Ej. 5000"
                  className="flex-1 px-3.5 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
                <label htmlFor="budget-cap-currency" className="sr-only">
                  Moneda del presupuesto mensual
                </label>
                <select
                  id="budget-cap-currency"
                  value={budgetCapCurrency}
                  onChange={(e) => setBudgetCapCurrency(e.target.value)}
                  className="w-28 px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-semibold"
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
                  maxLength={4096}
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
                onChange={(e) => setNewMasterPassword(e.target.value)}
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
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50"
          >
            <Save size={14} aria-hidden="true" />
            <span>{isSaving ? 'Guardando...' : 'Guardar cambios'}</span>
          </button>
        </div>
      </form>

      {/* Dynamic Runtime System Configuration */}
      <form
        onSubmit={handleSaveRuntimeConfig}
        className="min-w-0 space-y-5 rounded-xl border border-obsidian-border bg-obsidian-panel p-3 sm:p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-obsidian-border">
          <div className="flex items-center gap-2">
            <Globe size={16} className="text-cyan-400" aria-hidden="true" />
            <h3 className="text-sm font-bold text-white">Configuración Dinámica del Sistema</h3>
            <InfoTooltip content="Administra monedas soportadas, moneda base, configuración geográfica predeterminada del mapa y valores por defecto para reportes pentest." />
          </div>
          <button
            type="submit"
            disabled={savingRuntime}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold disabled:opacity-50 transition-colors"
          >
            <Save size={13} aria-hidden="true" />
            <span>{savingRuntime ? 'Guardando...' : 'Guardar configuración global'}</span>
          </button>
        </div>

        {/* Currencies & Locale */}
        <div className="space-y-3 text-xs">
          <div className="font-semibold text-white">Monedas Activas y Localización</div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label htmlFor="rt-base-currency" className="block text-obsidian-muted mb-1">
                Moneda Base
              </label>
              <select
                id="rt-base-currency"
                value={sysBaseCurrency}
                onChange={(e) => handleSetBaseCurrency(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-semibold focus:outline-none focus:border-cyan-500"
              >
                {sysCurrencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} ({c.symbol})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="rt-pair-base" className="block text-obsidian-muted mb-1">
                Par Divisa Base
              </label>
              <input
                id="rt-pair-base"
                type="text"
                maxLength={5}
                value={sysPairBase}
                onChange={(e) => setSysPairBase(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label htmlFor="rt-pair-target" className="block text-obsidian-muted mb-1">
                Par Divisa Destino
              </label>
              <input
                id="rt-pair-target"
                type="text"
                maxLength={5}
                value={sysPairTarget}
                onChange={(e) => setSysPairTarget(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label htmlFor="rt-locale" className="block text-obsidian-muted mb-1">
                Formato Regional (Locale)
              </label>
              <input
                id="rt-locale"
                type="text"
                maxLength={16}
                value={sysLocale}
                onChange={(e) => setSysLocale(e.target.value)}
                placeholder="es-MX"
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {sysCurrencies.map((c) => (
              <div
                key={c.code}
                className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs ${
                  c.code === sysBaseCurrency
                    ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200'
                    : 'bg-obsidian-bg border-obsidian-border text-obsidian-text'
                }`}
              >
                <span className="font-mono font-bold">{c.code}</span>
                <span className="text-obsidian-muted">{c.symbol}</span>
                <span>{c.name}</span>
                {c.code !== sysBaseCurrency && sysCurrencies.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Eliminar moneda ${c.code}`}
                    onClick={() => handleRemoveCurrency(c.code)}
                    className="text-obsidian-muted hover:text-rose-400"
                  >
                    <Trash2 size={12} aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1">
            <input
              type="text"
              maxLength={5}
              value={newCurrCode}
              onChange={(e) => setNewCurrCode(e.target.value.toUpperCase())}
              aria-label="Código de nueva moneda"
              placeholder="Código (ej. EUR)"
              className="px-3 py-1.5 rounded-lg bg-obsidian-bg border border-obsidian-border text-white font-mono focus:outline-none focus:border-cyan-500"
            />
            <input
              type="text"
              maxLength={60}
              value={newCurrName}
              onChange={(e) => setNewCurrName(e.target.value)}
              aria-label="Nombre de nueva moneda"
              placeholder="Nombre (ej. Euro)"
              className="px-3 py-1.5 rounded-lg bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-cyan-500"
            />
            <input
              type="text"
              maxLength={4}
              value={newCurrSymbol}
              onChange={(e) => setNewCurrSymbol(e.target.value)}
              aria-label="Símbolo de nueva moneda"
              placeholder="Símbolo ($)"
              className="px-3 py-1.5 rounded-lg bg-obsidian-bg border border-obsidian-border text-white font-mono focus:outline-none focus:border-cyan-500"
            />
            <button
              type="button"
              onClick={handleAddCurrency}
              className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-obsidian-surface hover:bg-obsidian-border border border-obsidian-border text-white font-semibold"
            >
              <Plus size={13} aria-hidden="true" />
              <span>Agregar moneda</span>
            </button>
          </div>
        </div>

        {/* Map Geography & Zones */}
        <div className="space-y-3 pt-3 border-t border-obsidian-border text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-white">
            <MapPin size={14} className="text-emerald-400" aria-hidden="true" />
            <span>Geografía y Sectores de Captura (Mapa)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="rt-map-city" className="block text-obsidian-muted mb-1">Ciudad predeterminada</label>
              <input
                id="rt-map-city"
                type="text"
                maxLength={100}
                value={mapDefaultCity}
                onChange={(e) => setMapDefaultCity(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label htmlFor="rt-map-zone" className="block text-obsidian-muted mb-1">Zona predeterminada</label>
              <input
                id="rt-map-zone"
                type="text"
                maxLength={100}
                value={mapDefaultZone}
                onChange={(e) => setMapDefaultZone(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label htmlFor="rt-map-sector" className="block text-obsidian-muted mb-1">Sector predeterminado</label>
              <input
                id="rt-map-sector"
                type="text"
                maxLength={100}
                value={mapDefaultSector}
                onChange={(e) => setMapDefaultSector(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label htmlFor="rt-map-lat" className="block text-obsidian-muted mb-1">Latitud central</label>
              <input
                id="rt-map-lat"
                type="text"
                value={mapCenterLat}
                onChange={(e) => setMapCenterLat(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label htmlFor="rt-map-lon" className="block text-obsidian-muted mb-1">Longitud central</label>
              <input
                id="rt-map-lon"
                type="text"
                value={mapCenterLon}
                onChange={(e) => setMapCenterLon(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label htmlFor="rt-map-zoom" className="block text-obsidian-muted mb-1">Zoom inicial</label>
              <input
                id="rt-map-zoom"
                type="number"
                min={1}
                max={20}
                value={mapZoom}
                onChange={(e) => setMapZoom(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {sysMapZones.length > 0 && (
            <div className="space-y-2">
              {sysMapZones.map((zone) => (
                <div
                  key={zone.slug}
                  className="p-2.5 rounded-lg bg-obsidian-bg border border-obsidian-border space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-white">
                      {zone.zone}{' '}
                      <span className="font-mono text-[10px] text-obsidian-muted">({zone.slug})</span>
                    </div>
                    <button
                      type="button"
                      aria-label={`Eliminar zona ${zone.zone}`}
                      onClick={() => handleRemoveZone(zone.slug)}
                      className="text-obsidian-muted hover:text-rose-400"
                    >
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={zone.colonias.join(', ')}
                    onChange={(e) => handleUpdateZoneColonias(zone.slug, e.target.value)}
                    aria-label={`Colonias de ${zone.zone}`}
                    placeholder="Colonias separadas por coma..."
                    className="w-full px-2.5 py-1 rounded bg-obsidian-panel border border-obsidian-border text-[11px] text-obsidian-text focus:outline-none focus:border-emerald-500"
                  />
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              maxLength={80}
              value={newZoneName}
              onChange={(e) => setNewZoneName(e.target.value)}
              aria-label="Nombre de nueva zona geográfica"
              placeholder="Nueva zona (ej. Zona Norte)"
              className="px-3 py-1.5 rounded-lg bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-emerald-500"
            />
            <input
              type="text"
              maxLength={400}
              value={newZoneColonias}
              onChange={(e) => setNewZoneColonias(e.target.value)}
              aria-label="Colonias de la nueva zona"
              placeholder="Colonias separadas por coma"
              className="px-3 py-1.5 rounded-lg bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={handleAddZone}
              className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-obsidian-surface hover:bg-obsidian-border border border-obsidian-border text-white font-semibold"
            >
              <Plus size={13} aria-hidden="true" />
              <span>Agregar zona</span>
            </button>
          </div>
        </div>

        {/* Writeup Defaults */}
        <div className="space-y-3 pt-3 border-t border-obsidian-border text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-white">
            <FileText size={14} className="text-indigo-400" aria-hidden="true" />
            <span>Reportes Pentest / Writeups</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="rt-writeup-org" className="block text-obsidian-muted mb-1">
                Organización predeterminada
              </label>
              <input
                id="rt-writeup-org"
                type="text"
                maxLength={120}
                value={writeupOrgName}
                onChange={(e) => setWriteupOrgName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="rt-writeup-watermark" className="block text-obsidian-muted mb-1">
                Marca de agua predeterminada
              </label>
              <input
                id="rt-writeup-watermark"
                type="text"
                maxLength={120}
                value={writeupWatermark}
                onChange={(e) => setWriteupWatermark(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>
      </form>

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
