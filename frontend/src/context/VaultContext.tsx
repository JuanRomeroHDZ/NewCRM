import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { VaultStatus, ExchangeRate, PaymentMethod, ScopeFilter, EntityScope } from '../types';
import { api, setApiVaultToken, getApiVaultToken } from '../lib/api';

export type SectionType = 
  | 'dashboard'
  | 'emails'
  | 'platforms'
  | 'prospects'
  | 'passwords'
  | 'graph'
  | 'subscriptions'
  | 'trash'
  | 'settings'
  | 'security_audit'
  | 'audit_logs';

export type InspectorEntityType = 'email' | 'platform' | 'payment' | 'prospect';

interface Toast {
  id: string;
  message: string;
  type?: 'success' | 'info' | 'warning' | 'error';
  duration?: number;
}

interface VaultContextType {
  // Vault status
  isSetup: boolean;
  isUnlocked: boolean;
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
  panicLock: () => Promise<void>;
  setupMasterPassword: (password: string) => Promise<void>;
  copyToClipboard: (text: string, label?: string) => Promise<void>;
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

  // Exchange Rate
  exchangeRate: ExchangeRate | null;
  refreshExchangeRate: () => Promise<void>;

  // Toasts
  toasts: Toast[];
  showToast: (msg: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
  dismissToast: (id: string) => void;

  // Global reload counter
  dataVersion: number;
  triggerDataReload: () => void;
}

const VaultContext = createContext<VaultContextType | undefined>(undefined);

export const VaultProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSetup, setIsSetup] = useState<boolean>(true);
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [timeoutMinutes, setTimeoutMinutes] = useState<number>(10);
  const [clipboardClearSeconds, setClipboardClearSeconds] = useState<number>(30);
  const [allowRevealPasswords, setAllowRevealPasswords] = useState<boolean>(false);
  const [searchHotkey, setSearchHotkey] = useState<string>('ctrl+k');
  const [accentColor, setAccentColor] = useState<string>('#6366f1');
  const [canvasStyle, setCanvasStyle] = useState<string>('dot-grid');

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
  const [activeSection, setActiveSection] = useState<SectionType>('dashboard');
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

  // Exchange rate & data reload
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null);
  const [dataVersion, setDataVersion] = useState(0);

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const triggerDataReload = useCallback(() => {
    setDataVersion((v) => v + 1);
  }, []);

  // Check vault status
  const refreshVaultStatus = useCallback(async () => {
    try {
      const status = await api.getVaultStatus();
      setIsSetup(status.is_setup);
      setIsUnlocked(status.is_unlocked);
      setRemainingSeconds(status.remaining_seconds);
      setTimeoutMinutes(status.timeout_minutes);
      setClipboardClearSeconds(status.clipboard_clear_seconds);
      setAllowRevealPasswords(status.allow_reveal_passwords);
      setSearchHotkey(status.search_hotkey || 'ctrl+k');

      if (!status.is_unlocked && getApiVaultToken()) {
        setApiVaultToken(null);
      }
    } catch (err) {
      console.error('Error fetching vault status:', err);
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

  useEffect(() => {
    refreshVaultStatus();
    refreshExchangeRate();
    const handleVaultLocked = () => {
      setIsUnlocked(false);
      setRemainingSeconds(0);
    };
    window.addEventListener('vault_locked', handleVaultLocked);
    return () => window.removeEventListener('vault_locked', handleVaultLocked);
  }, [refreshVaultStatus, refreshExchangeRate]);

  // Countdown timer for vault auto-lock
  useEffect(() => {
    if (!isUnlocked || remainingSeconds <= 0) return;

    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setApiVaultToken(null);
          setIsUnlocked(false);
          showToast('La bóveda se ha bloqueado automáticamente por inactividad', 'warning');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isUnlocked, remainingSeconds, showToast]);

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

  const unlockVault = async (password: string) => {
    const res = await api.unlockVault(password);
    setApiVaultToken(res.token);
    setIsUnlocked(true);
    setRemainingSeconds(res.remaining_seconds);
    setIsUnlockModalOpen(false);
    showToast('Bóveda descifrada con éxito. Modo seguro activo.', 'success');
    triggerDataReload();
  };

  const lockVault = async () => {
    try {
      await api.lockVault();
    } catch (_) {}
    setApiVaultToken(null);
    setIsUnlocked(false);
    setRemainingSeconds(0);
    showToast('Bóveda bloqueada.', 'info');
    triggerDataReload();
  };

  const panicLock = async () => {
    try {
      await api.lockVault();
    } catch (_) {}
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
    setApiVaultToken(res.token);
    setIsSetup(true);
    setIsUnlocked(true);
    setRemainingSeconds(res.timeout_minutes * 60);
    showToast('Contraseña maestra configurada exitosamente.', 'success');
    triggerDataReload();
  };

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
    } catch (err) {
      showToast('Error al copiar al portapapeles.', 'error');
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
  const openUnlockModal = () => setIsUnlockModalOpen(true);
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
        toasts,
        showToast,
        dismissToast,
        dataVersion,
        triggerDataReload
      }}
    >
      {children}
    </VaultContext.Provider>
  );
};

export const useVault = () => {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error('useVault must be used within VaultProvider');
  return ctx;
};
