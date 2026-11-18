import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { VaultStatus, ExchangeRate, PaymentMethod, ScopeFilter, EntityScope, RuntimeConfig, RuntimeCurrencyOption } from '../types';
import { api, setApiVaultToken, getApiVaultToken, getApiUserToken, setApiUserToken } from '../lib/api';
import { ConfirmDialog, ConfirmDialogOptions } from '../components/common/ConfirmDialog';
import { PromptDialog, PromptDialogOptions } from '../components/common/PromptDialog';
import { deriveDraftKey } from '../lib/writeupDraftRecovery';
import { createRequestSequence } from '../lib/requestSequence';
import { useSessionState } from '../hooks/useSessionState';

const sections = [
  'dashboard', 'help', 'emails', 'platforms', 'capture', 'prospects',
  'passwords', 'graph', 'writeups', 'subscriptions', 'trash', 'settings',
  'settings_appearance', 'settings_session', 'settings_limits', 'settings_access', 'settings_network', 'settings_writeups',
  'settings_tools', 'settings_backup', 'settings_team', 'security_audit', 'audit_logs', 'c2_hosts',
  'c2_topo', 'c2_ports', 'c2_mitm', 'c2_sniff', 'c2_dns', 'c2_creds',
  'c2_http', 'c2_poison', 'c2_mitm6', 'c2_wifi', 'c2_camera', 'c2_opsec',
  'overview_prospection', 'overview_communications', 'overview_finances', 'overview_security', 'overview_c2', 'overview_activity',
  'overview_settings', 'finance_income', 'finance_services', 'finance_expenses', 'finance_cards',
  'reports_documents', 'reports_canvases', 'overview_reports',
] as const;

export type SectionType = typeof sections[number];
const validSections: ReadonlySet<unknown> = new Set(sections);

function parseSection(value: unknown): SectionType | undefined {
  return validSections.has(value) ? value as SectionType : undefined;
}

export type InspectorEntityType = 'email' | 'platform' | 'payment' | 'prospect';

type ToastAction = { label: string; run: () => void; detail?: string };

interface Toast {
  id: string;
  message: string;
  type?: 'success' | 'info' | 'warning' | 'error';
  action?: ToastAction;
}

interface VaultContextType {
  // Vault status
  isSetup: boolean;
  isUnlocked: boolean;
  draftRecoveryKey: CryptoKey | null;
  enableDraftRecovery: (password: string) => Promise<void>;
  vaultStatusError: string | null;
  remainingSeconds: number;
  timeoutMinutes: number;
  clipboardClearSeconds: number;
  allowRevealPasswords: boolean;
  searchHotkey: string;
  accentColor: string;
  setAccentColor: (color: string) => void;
  canvasStyle: string;
  setCanvasStyle: (style: string) => void;

  // Global Scope Filter (Todo | Empresa | Personal)
  activeScope: ScopeFilter;
  setActiveScope: (scope: ScopeFilter) => void;
  matchesScope: (itemScope?: EntityScope | string) => boolean;
  defaultEntityScope: EntityScope;
  
  // Actions
  unlockVault: (password: string) => Promise<void>;
  lockVault: () => Promise<void>;
  recordVaultActivity: () => Promise<{ remaining_seconds: number; account_active: boolean | null }>;
  panicLock: () => Promise<void>;
  setupMasterPassword: (password: string) => Promise<void>;
  copyToClipboard: (text: string, label?: string) => Promise<boolean>;
  refreshVaultStatus: () => Promise<void>;

  // Navigation & Inspector
  activeSection: SectionType;
  setActiveSection: (sec: SectionType) => void;
  selectedEntity: { type: InspectorEntityType; id: string } | null;
  openInspector: (type: InspectorEntityType, id: string) => void;
  closeInspector: () => void;

  // Modals
  isUnlockModalOpen: boolean;
  openUnlockModal: () => void;
  closeUnlockModal: () => void;

  isPasswordGenOpen: boolean;
  openPasswordGen: () => void;
  closePasswordGen: () => void;

  isCommandPaletteOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;

  isEmergencyKitOpen: boolean;
  openEmergencyKit: () => void;
  closeEmergencyKit: () => void;

  isImportModalOpen: boolean;
  openImportModal: () => void;
  closeImportModal: () => void;

  isEncryptedBackupOpen: boolean;
  openEncryptedBackup: () => void;
  closeEncryptedBackup: () => void;

  isEnvExportOpen: boolean;
  openEnvExport: () => void;
  closeEnvExport: () => void;

  isEmailModalOpen: boolean;
  openEmailModal: (editId?: string) => void;
  closeEmailModal: () => void;
  editingEmailId?: string;

  isPlatformModalOpen: boolean;
  openPlatformModal: (defaultEmailId?: string, editId?: string) => void;
  closePlatformModal: () => void;
  platformModalDefaultEmailId?: string;
  editingPlatformId?: string;

  isProspectModalOpen: boolean;
  openProspectModal: (defaultEmailId?: string, editId?: string) => void;
  closeProspectModal: () => void;
  prospectModalDefaultEmailId?: string;
  editingProspectId?: string;

  isPaymentModalOpen: boolean;
  openPaymentModal: (editPayment?: PaymentMethod) => void;
  closePaymentModal: () => void;
  editingPayment?: PaymentMethod;

  // Exchange Rate & Runtime Config
  exchangeRate: ExchangeRate | null;
  refreshExchangeRate: () => Promise<void>;
  runtimeConfig: RuntimeConfig | null;
  runtimeConfigLoading: boolean;
  runtimeConfigError: string | null;
  refreshRuntimeConfig: () => Promise<boolean>;
  supportedCurrencies: RuntimeCurrencyOption[];
  baseCurrency: string;
  systemLocale: string;

  // Accessible Dialogs
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
  prompt: (options: PromptDialogOptions) => Promise<string | null>;

  // Toasts
  toasts: Toast[];
  showToast: (msg: string, type?: 'success' | 'info' | 'warning' | 'error', action?: ToastAction) => void;
  dismissToast: (id: string) => void;

  // Global reload counter
  dataVersion: number;
  triggerDataReload: () => void;
}

const VaultContext = createContext<VaultContextType | undefined>(undefined);
const DEFAULT_ACCENT_COLOR = '#0F766E';
const LEGACY_DEFAULT_ACCENT_COLOR = '#6366f1';

function normalizeAccentColor(value: string | undefined): string {
  if (!value || !/^#[\da-f]{6}$/i.test(value)) return DEFAULT_ACCENT_COLOR;
  return value.toLowerCase() === LEGACY_DEFAULT_ACCENT_COLOR ? DEFAULT_ACCENT_COLOR : value;
}

export const VaultProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSetup, setIsSetup] = useState<boolean>(true);
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [draftRecoveryKey, setDraftRecoveryKey] = useState<CryptoKey | null>(null);
  useEffect(() => { if (!isUnlocked) setDraftRecoveryKey(null); }, [isUnlocked]);
  const [vaultStatusError, setVaultStatusError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [timeoutMinutes, setTimeoutMinutes] = useState<number>(10);
  const [clipboardClearSeconds, setClipboardClearSeconds] = useState<number>(30);
  const [allowRevealPasswords, setAllowRevealPasswords] = useState<boolean>(false);
  const [searchHotkey, setSearchHotkey] = useState<string>('ctrl+k');
  const [accentColor, setAccentColor] = useState<string>(DEFAULT_ACCENT_COLOR);
  const [canvasStyle, setCanvasStyle] = useState<string>('plain');

  // Global Scope Filter
  const [activeScope, setActiveScopeState] = useState<ScopeFilter>(() => {
    const saved = localStorage.getItem('emailsaver_active_scope');
    if (saved === 'business' || saved === 'personal' || saved === 'all') return saved;
    return 'all';
  });

  const setActiveScope = useCallback((scope: ScopeFilter) => {
    setActiveScopeState(scope);
    localStorage.setItem('emailsaver_active_scope', scope);
  }, []);

  const matchesScope = useCallback(
    (itemScope?: EntityScope | string) => {
      if (activeScope === 'all') return true;
      const normalized = itemScope || 'business';
      if (normalized === 'shared') return true;
      return normalized === activeScope;
    },
    [activeScope]
  );

  const defaultEntityScope: EntityScope = activeScope === 'personal' ? 'personal' : 'business';

  // Navigation
  const [activeSection, setActiveSection] = useSessionState<SectionType>('lessso.navigation.section', 'dashboard', parseSection);
  const [selectedEntity, setSelectedEntity] = useState<{ type: InspectorEntityType; id: string } | null>(null);

  // Modals
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [isPasswordGenOpen, setIsPasswordGenOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isEmergencyKitOpen, setIsEmergencyKitOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isEncryptedBackupOpen, setIsEncryptedBackupOpen] = useState(false);
  const [isEnvExportOpen, setIsEnvExportOpen] = useState(false);
  
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [editingEmailId, setEditingEmailId] = useState<string | undefined>();

  const [isPlatformModalOpen, setIsPlatformModalOpen] = useState(false);
  const [platformModalDefaultEmailId, setPlatformModalDefaultEmailId] = useState<string | undefined>();
  const [editingPlatformId, setEditingPlatformId] = useState<string | undefined>();

  const [isProspectModalOpen, setIsProspectModalOpen] = useState(false);
  const [prospectModalDefaultEmailId, setProspectModalDefaultEmailId] = useState<string | undefined>();
  const [editingProspectId, setEditingProspectId] = useState<string | undefined>();

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<PaymentMethod | undefined>();

  // Exchange rate, runtime config & data reload
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null);
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig | null>(null);
  const [runtimeConfigLoading, setRuntimeConfigLoading] = useState(false);
  const [runtimeConfigError, setRuntimeConfigError] = useState<string | null>(null);
  const runtimeConfigRequest = useRef(0);
  const vaultStatusRequests = useRef(createRequestSequence());
  const [dataVersion, setDataVersion] = useState(0);

  // Accessible Dialog state (replaces window.confirm / window.prompt)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogOptions | null>(null);
  const confirmResolverRef = useRef<((accepted: boolean) => void) | null>(null);

  const [promptDialog, setPromptDialog] = useState<PromptDialogOptions | null>(null);
  const promptResolverRef = useRef<((value: string | null) => void) | null>(null);

  const confirm = useCallback((options: ConfirmDialogOptions): Promise<boolean> => {
    if (confirmResolverRef.current) {
      confirmResolverRef.current(false);
    }
    return new Promise<boolean>((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmDialog(options);
    });
  }, []);

  const prompt = useCallback((options: PromptDialogOptions): Promise<string | null> => {
    if (promptResolverRef.current) {
      promptResolverRef.current(null);
    }
    return new Promise<string | null>((resolve) => {
      promptResolverRef.current = resolve;
      setPromptDialog(options);
    });
  }, []);

  const handleConfirmResult = useCallback((accepted: boolean) => {
    const resolve = confirmResolverRef.current;
    confirmResolverRef.current = null;
    setConfirmDialog(null);
    resolve?.(accepted);
  }, []);

  const handlePromptResult = useCallback((value: string | null) => {
    const resolve = promptResolverRef.current;
    promptResolverRef.current = null;
    setPromptDialog(null);
    resolve?.(value);
  }, []);
  const cancelPrompt = useCallback(() => handlePromptResult(null), [handlePromptResult]);

  // Toasts (bounded to 2 simultaneous visible notifications and auto-closed at 4s)
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastTimersRef = useRef<Record<string, number>>({});

  const dismissToast = useCallback((id: string) => {
    const timer = toastTimersRef.current[id];
    if (timer) {
      window.clearTimeout(timer);
      delete toastTimersRef.current[id];
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info', action?: ToastAction) => {
    const id = Math.random().toString(36).substring(2, 9);
    const normalized = message.trim().toLowerCase();
    const isVaultTransition = normalized.includes('bóveda') || normalized.includes('espacio seguro');

    setToasts((prev) => {
      const filtered = prev.filter((existing) => {
        const existingNorm = existing.message.trim().toLowerCase();
        const duplicate = existingNorm === normalized || (isVaultTransition && (existingNorm.includes('bóveda') || existingNorm.includes('espacio seguro')));
        if (duplicate && toastTimersRef.current[existing.id]) {
          window.clearTimeout(toastTimersRef.current[existing.id]);
          delete toastTimersRef.current[existing.id];
        }
        return !duplicate;
      });
      const next = [...filtered, { id, message, type, action }];
      if (next.length > 2) {
        const dropped = next.slice(0, next.length - 2);
        for (const item of dropped) {
          if (toastTimersRef.current[item.id]) {
            window.clearTimeout(toastTimersRef.current[item.id]);
            delete toastTimersRef.current[item.id];
          }
        }
        return next.slice(-2);
      }
      return next;
    });

    toastTimersRef.current[id] = window.setTimeout(() => {
      delete toastTimersRef.current[id];
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, action ? 12000 : 4000);
  }, []);

  const triggerDataReload = useCallback(() => {
    setDataVersion((v) => v + 1);
  }, []);

  // Check vault status
  const refreshVaultStatus = useCallback(async () => {
    const requestVersion = vaultStatusRequests.current.next();
    try {
      const status = await api.getVaultStatus();
      // A status read started before a successful unlock/lock must not undo it
      // when its slower response arrives afterward.
      if (!vaultStatusRequests.current.isCurrent(requestVersion)) return;
      setVaultStatusError(null);
      setIsSetup(status.is_setup);
      setIsUnlocked(status.is_unlocked);
      setRemainingSeconds(status.remaining_seconds);
      setTimeoutMinutes(status.timeout_minutes);
      setClipboardClearSeconds(status.clipboard_clear_seconds);
      setAllowRevealPasswords(status.allow_reveal_passwords);
      setSearchHotkey(status.search_hotkey || 'ctrl+k');
      setAccentColor(normalizeAccentColor(status.accent_color));
      setCanvasStyle('plain');

      if (!status.is_unlocked && getApiVaultToken()) {
        setApiVaultToken(null);
      }
    } catch (err: any) {
      if (vaultStatusRequests.current.isCurrent(requestVersion)) {
        setVaultStatusError(err?.message || 'No se pudo conectar con la API de bóveda.');
        console.error('Error fetching vault status:', err);
      }
    }
  }, []);

  const refreshExchangeRate = useCallback(async () => {
    try {
      const rate = await api.getExchangeRate();
      setExchangeRate(rate);
    } catch (err) {
      console.error('Error fetching exchange rate:', err);
    }
  }, []);

  const refreshRuntimeConfig = useCallback(async (): Promise<boolean> => {
    const requestId = ++runtimeConfigRequest.current;
    if (!isUnlocked) {
      setRuntimeConfig(null);
      setRuntimeConfigError(null);
      setRuntimeConfigLoading(false);
      return false;
    }
    setRuntimeConfigLoading(true);
    setRuntimeConfigError(null);
    try {
      const cfg = await api.getRuntimeConfig();
      if (requestId !== runtimeConfigRequest.current) return false;
      setRuntimeConfig(cfg);
      return true;
    } catch (err: any) {
      if (requestId === runtimeConfigRequest.current) {
        setRuntimeConfig(null);
        setRuntimeConfigError(err?.message || 'No se pudo cargar la configuración.');
      }
      console.error('Error fetching runtime config:', err);
      return false;
    } finally {
      if (requestId === runtimeConfigRequest.current) setRuntimeConfigLoading(false);
    }
  }, [isUnlocked]);

  useEffect(() => {
    refreshVaultStatus();
    const handleVaultLocked = () => {
      vaultStatusRequests.current.invalidate();
      setIsUnlocked(false);
      setRemainingSeconds(0);
    };
    const handleVaultTokenChanged = (event: Event) => {
      const token = (event as CustomEvent<{ token: string | null }>).detail?.token;
      if (!token) {
        vaultStatusRequests.current.invalidate();
        setIsUnlocked(false);
        setRemainingSeconds(0);
        return;
      }
      void refreshVaultStatus();
    };
    window.addEventListener('vault_locked', handleVaultLocked);
    window.addEventListener('vault_token_changed', handleVaultTokenChanged);
    return () => {
      window.removeEventListener('vault_locked', handleVaultLocked);
      window.removeEventListener('vault_token_changed', handleVaultTokenChanged);
    };
  }, [refreshVaultStatus]);

  useEffect(() => {
    if (!isUnlocked) {
      runtimeConfigRequest.current += 1;
      setExchangeRate(null);
      setRuntimeConfig(null);
      setRuntimeConfigLoading(false);
      setRuntimeConfigError(null);
      return;
    }
    refreshExchangeRate();
    refreshRuntimeConfig();
  }, [isUnlocked, refreshExchangeRate, refreshRuntimeConfig]);

  const supportedCurrencies: RuntimeCurrencyOption[] =
    runtimeConfig?.currencies && runtimeConfig.currencies.length > 0
      ? runtimeConfig.currencies
      : [
          { code: 'MXN', name: 'Peso Mexicano', symbol: '$', is_base: true },
          { code: 'USD', name: 'Dólar Estadounidense', symbol: 'US$', is_base: false },
        ];
  const baseCurrency =
    runtimeConfig?.currency_config?.base_currency ||
    supportedCurrencies.find((c) => c.is_base)?.code ||
    supportedCurrencies[0]?.code ||
    'MXN';
  const systemLocale = runtimeConfig?.currency_config?.locale || 'es-MX';

  const recordVaultActivity = useCallback(async () => {
    if (!isUnlocked) throw new Error('La bóveda está bloqueada.');
    const vaultToken = getApiVaultToken();
    const userToken = getApiUserToken();
    const result = await api.recordVaultActivity();
    if (vaultToken && vaultToken === getApiVaultToken()) {
      vaultStatusRequests.current.invalidate();
      setRemainingSeconds(result.remaining_seconds);
      if (result.account_active === false && userToken && userToken === getApiUserToken()) {
        setApiUserToken(null);
        window.dispatchEvent(new CustomEvent('core_user_session_expired'));
      }
    }
    return result;
  }, [isUnlocked]);

  // Only real user interaction extends the server-side inactivity deadline.
  useEffect(() => {
    if (!isUnlocked) return;
    let lastAttempt = 0;
    let active = true;
    const recordActivity = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastAttempt < 15000) return;
      lastAttempt = Date.now();
      void recordVaultActivity().catch(() => { lastAttempt = 0; });
    };
    const events = ['pointerdown', 'keydown', 'input', 'wheel', 'touchstart'] as const;
    events.forEach((event) => window.addEventListener(event, recordActivity, { passive: true }));
    return () => {
      active = false;
      events.forEach((event) => window.removeEventListener(event, recordActivity));
    };
  }, [isUnlocked, recordVaultActivity]);

  // Confirm expiry with the server: another tab may have extended the session.
  useEffect(() => {
    if (!isUnlocked) return;

    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          void refreshVaultStatus();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isUnlocked, refreshVaultStatus]);

  // Global hotkey handler (Ctrl+K or Escape to close modals)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
        return;
      }
      if (e.key === 'Escape') {
        if (isCommandPaletteOpen) { setIsCommandPaletteOpen(false); return; }
        if (isUnlockModalOpen) { setIsUnlockModalOpen(false); return; }
        if (isPasswordGenOpen) { setIsPasswordGenOpen(false); return; }
        if (isEmailModalOpen) { setEditingEmailId(undefined); setIsEmailModalOpen(false); return; }
        if (isPlatformModalOpen) { setPlatformModalDefaultEmailId(undefined); setEditingPlatformId(undefined); setIsPlatformModalOpen(false); return; }
        if (isProspectModalOpen) { setProspectModalDefaultEmailId(undefined); setEditingProspectId(undefined); setIsProspectModalOpen(false); return; }
        if (isPaymentModalOpen) { setEditingPayment(undefined); setIsPaymentModalOpen(false); return; }
        if (isEmergencyKitOpen) { setIsEmergencyKitOpen(false); return; }
        if (isImportModalOpen) { setIsImportModalOpen(false); return; }
        if (isEncryptedBackupOpen) { setIsEncryptedBackupOpen(false); return; }
        if (isEnvExportOpen) { setIsEnvExportOpen(false); return; }
        if (selectedEntity) { setSelectedEntity(null); return; }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isCommandPaletteOpen,
    isUnlockModalOpen,
    isPasswordGenOpen,
    isEmailModalOpen,
    isPlatformModalOpen,
    isProspectModalOpen,
    isPaymentModalOpen,
    isEmergencyKitOpen,
    isImportModalOpen,
    isEncryptedBackupOpen,
    isEnvExportOpen,
    selectedEntity,
  ]);

  const enableDraftRecovery = async (password: string) => {
    const token = getApiVaultToken();
    if (!token) throw new Error('Desbloquea la bóveda para recuperar la copia.');
    const { verified } = await api.verifyVaultPassword(password);
    if (!verified) throw new Error('No se pudo verificar la contraseña de la bóveda.');
    const recoveryKey = await deriveDraftKey(password);
    if (getApiVaultToken() !== token) throw new Error('La sesión de bóveda cambió. Vuelve a intentarlo.');
    setDraftRecoveryKey(recoveryKey);
  };

  const unlockVault = async (password: string) => {
    const res = await api.unlockVault(password);
    vaultStatusRequests.current.invalidate();
    let recoveryKey: CryptoKey | null = null;
    try { recoveryKey = await deriveDraftKey(password); } catch { showToast('No está disponible la recuperación local cifrada de informes en este navegador.', 'warning'); }
    setDraftRecoveryKey(recoveryKey);
    setApiVaultToken(res.token);
    setIsUnlocked(true);
    setRemainingSeconds(res.remaining_seconds);
    setIsUnlockModalOpen(false);
    showToast('Bóveda descifrada con éxito. Modo seguro activo.', 'success');
    triggerDataReload();
  };

  const lockVault = async () => {
    vaultStatusRequests.current.invalidate();
    let serverRevoked = true;
    try {
      await api.lockVault();
    } catch (_) { serverRevoked = false; }
    vaultStatusRequests.current.invalidate();
    setApiVaultToken(null);
    setIsUnlocked(false);
    setRemainingSeconds(0);
    showToast(serverRevoked ? 'Bóveda bloqueada.' : 'Bóveda bloqueada en este navegador; no se pudo confirmar el cierre de la sesión en el servidor.', serverRevoked ? 'info' : 'warning');
    triggerDataReload();
  };

  const panicLock = async () => {
    vaultStatusRequests.current.invalidate();
    try {
      await api.lockVault();
    } catch (_) {}
    vaultStatusRequests.current.invalidate();
    setApiVaultToken(null);
    setIsUnlocked(false);
    setRemainingSeconds(0);
    try {
      await navigator.clipboard.writeText('');
    } catch (_) {}
    setSelectedEntity(null);
    setIsUnlockModalOpen(false);
    setIsPasswordGenOpen(false);
    setIsCommandPaletteOpen(false);
    setIsEmergencyKitOpen(false);
    setIsImportModalOpen(false);
    setIsEncryptedBackupOpen(false);
    setIsEnvExportOpen(false);
    setIsEmailModalOpen(false);
    setIsPlatformModalOpen(false);
    setIsProspectModalOpen(false);
    setIsPaymentModalOpen(false);
    showToast('Bloqueo de pánico activado: Bóveda cerrada y portapapeles purgado.', 'warning');
    triggerDataReload();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault();
        panicLock();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const setupMasterPassword = async (password: string) => {
    const res = await api.setupMasterPassword(password);
    vaultStatusRequests.current.invalidate();
    let recoveryKey: CryptoKey | null = null;
    try { recoveryKey = await deriveDraftKey(password); } catch { showToast('No está disponible la recuperación local cifrada de informes en este navegador.', 'warning'); }
    setDraftRecoveryKey(recoveryKey);
    setApiVaultToken(res.token);
    setIsSetup(true);
    setIsUnlocked(true);
    setVaultStatusError(null);
    setRemainingSeconds(res.timeout_minutes * 60);
    setIsUnlockModalOpen(false);
    showToast('Contraseña de acceso configurada.', 'success');
    triggerDataReload();
  };

  // Lleva al alta inicial solo cuando la bóveda está desbloqueada.
  useEffect(() => {
    if (!isUnlocked) return;
    let active = true;
    api.getBootstrapStatus().then(({ available }) => {
      if (active && available) setActiveSection('settings_team');
    }).catch(() => {});
    return () => { active = false; };
  }, [isUnlocked]);

  // Secure clipboard copy with auto-clear timer
  const copyToClipboard = async (text: string, label: string = 'Secreto') => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label} copiado. Se limpiará el portapapeles en ${clipboardClearSeconds}s.`, 'success');

      // Schedule clearing clipboard
      setTimeout(async () => {
        try {
          const current = await navigator.clipboard.readText();
          if (current === text) {
            await navigator.clipboard.writeText('');
            showToast('Portapapeles limpiado automáticamente por seguridad.', 'info');
          }
        } catch (_) {
          // Ignore read clipboard permissions failure
        }
      }, clipboardClearSeconds * 1000);
      return true;
    } catch (err) {
      showToast('Error al copiar al portapapeles.', 'error');
      return false;
    }
  };

  // Inspector handlers
  const openInspector = (type: InspectorEntityType, id: string) => {
    setSelectedEntity({ type, id });
  };
  const closeInspector = () => {
    setSelectedEntity(null);
  };

  // Modal openers
  const openUnlockModal = () => {
    void refreshVaultStatus();
    setIsUnlockModalOpen(true);
  };
  const closeUnlockModal = () => setIsUnlockModalOpen(false);

  const openPasswordGen = () => setIsPasswordGenOpen(true);
  const closePasswordGen = () => setIsPasswordGenOpen(false);

  const openCommandPalette = () => setIsCommandPaletteOpen(true);
  const closeCommandPalette = () => setIsCommandPaletteOpen(false);

  const openEmailModal = (editId?: string) => {
    setEditingEmailId(editId);
    setIsEmailModalOpen(true);
  };
  const closeEmailModal = () => {
    setEditingEmailId(undefined);
    setIsEmailModalOpen(false);
  };

  const openPlatformModal = (defaultEmailId?: string, editId?: string) => {
    setPlatformModalDefaultEmailId(defaultEmailId);
    setEditingPlatformId(editId);
    setIsPlatformModalOpen(true);
  };
  const closePlatformModal = () => {
    setPlatformModalDefaultEmailId(undefined);
    setEditingPlatformId(undefined);
    setIsPlatformModalOpen(false);
  };

  const openProspectModal = (defaultEmailId?: string, editId?: string) => {
    setProspectModalDefaultEmailId(defaultEmailId);
    setEditingProspectId(editId);
    setIsProspectModalOpen(true);
  };
  const closeProspectModal = () => {
    setProspectModalDefaultEmailId(undefined);
    setEditingProspectId(undefined);
    setIsProspectModalOpen(false);
  };

  const openPaymentModal = (editPayment?: PaymentMethod) => {
    setEditingPayment(editPayment);
    setIsPaymentModalOpen(true);
  };
  const closePaymentModal = () => {
    setEditingPayment(undefined);
    setIsPaymentModalOpen(false);
  };

  const openEmergencyKit = () => setIsEmergencyKitOpen(true);
  const closeEmergencyKit = () => setIsEmergencyKitOpen(false);

  const openImportModal = () => setIsImportModalOpen(true);
  const closeImportModal = () => setIsImportModalOpen(false);

  const openEncryptedBackup = () => setIsEncryptedBackupOpen(true);
  const closeEncryptedBackup = () => setIsEncryptedBackupOpen(false);

  const openEnvExport = () => setIsEnvExportOpen(true);
  const closeEnvExport = () => setIsEnvExportOpen(false);

  return (
    <VaultContext.Provider
      value={{
        isSetup,
        isUnlocked,
        draftRecoveryKey,
        enableDraftRecovery,
        vaultStatusError,
        remainingSeconds,
        timeoutMinutes,
        clipboardClearSeconds,
        allowRevealPasswords,
        searchHotkey,
        accentColor,
        setAccentColor,
        canvasStyle,
        setCanvasStyle,
        activeScope,
        setActiveScope,
        matchesScope,
        defaultEntityScope,
        unlockVault,
        lockVault,
        recordVaultActivity,
        panicLock,
        setupMasterPassword,
        copyToClipboard,
        refreshVaultStatus,
        activeSection,
        setActiveSection,
        selectedEntity,
        openInspector,
        closeInspector,
        isUnlockModalOpen,
        openUnlockModal,
        closeUnlockModal,
        isPasswordGenOpen,
        openPasswordGen,
        closePasswordGen,
        isCommandPaletteOpen,
        openCommandPalette,
        closeCommandPalette,
        isEmergencyKitOpen,
        openEmergencyKit,
        closeEmergencyKit,
        isImportModalOpen,
        openImportModal,
        closeImportModal,
        isEncryptedBackupOpen,
        openEncryptedBackup,
        closeEncryptedBackup,
        isEnvExportOpen,
        openEnvExport,
        closeEnvExport,
        isEmailModalOpen,
        openEmailModal,
        closeEmailModal,
        editingEmailId,
        isPlatformModalOpen,
        openPlatformModal,
        closePlatformModal,
        platformModalDefaultEmailId,
        editingPlatformId,
        isProspectModalOpen,
        openProspectModal,
        closeProspectModal,
        prospectModalDefaultEmailId,
        editingProspectId,
        isPaymentModalOpen,
        openPaymentModal,
        closePaymentModal,
        editingPayment,
        exchangeRate,
        refreshExchangeRate,
        runtimeConfig,
        runtimeConfigLoading,
        runtimeConfigError,
        refreshRuntimeConfig,
        supportedCurrencies,
        baseCurrency,
        systemLocale,
        confirm,
        prompt,
        toasts,
        showToast,
        dismissToast,
        dataVersion,
        triggerDataReload
      }}
    >
      {children}
      <ConfirmDialog
        open={confirmDialog !== null}
        title={confirmDialog?.title || 'Confirmar acción'}
        message={confirmDialog?.message || ''}
        confirmLabel={confirmDialog?.confirmLabel}
        cancelLabel={confirmDialog?.cancelLabel}
        tone={confirmDialog?.tone}
        onConfirm={() => handleConfirmResult(true)}
        onCancel={() => handleConfirmResult(false)}
      />
      <PromptDialog
        open={promptDialog !== null}
        title={promptDialog?.title || 'Ingresar valor'}
        message={promptDialog?.message}
        defaultValue={promptDialog?.defaultValue}
        placeholder={promptDialog?.placeholder}
        confirmLabel={promptDialog?.confirmLabel}
        cancelLabel={promptDialog?.cancelLabel}
        required={promptDialog?.required}
        maxLength={promptDialog?.maxLength}
        onSubmit={handlePromptResult}
        onCancel={cancelPrompt}
      />
    </VaultContext.Provider>
  );
};

export const useVault = () => {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error('useVault must be used within VaultProvider');
  return ctx;
};
