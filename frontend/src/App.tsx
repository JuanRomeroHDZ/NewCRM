import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { VaultProvider, useVault } from './context/VaultContext';
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';

// Views and overlays are split into on-demand chunks so the dashboard does not
// download the map, audit screens, or large forms before the user opens them.
const InspectorDrawer = lazy(() => import('./components/layout/InspectorDrawer').then((module) => ({ default: module.InspectorDrawer })));
const VaultUnlockModal = lazy(() => import('./components/common/VaultUnlockModal').then((module) => ({ default: module.VaultUnlockModal })));
const PasswordGeneratorModal = lazy(() => import('./components/common/PasswordGeneratorModal').then((module) => ({ default: module.PasswordGeneratorModal })));
const CommandPalette = lazy(() => import('./components/common/CommandPalette').then((module) => ({ default: module.CommandPalette })));
const EmailModal = lazy(() => import('./components/modals/EmailModal').then((module) => ({ default: module.EmailModal })));
const PlatformModal = lazy(() => import('./components/modals/PlatformModal').then((module) => ({ default: module.PlatformModal })));
const ProspectModal = lazy(() => import('./components/modals/ProspectModal').then((module) => ({ default: module.ProspectModal })));
const PaymentModal = lazy(() => import('./components/modals/PaymentModal').then((module) => ({ default: module.PaymentModal })));
const EmergencyKitModal = lazy(() => import('./components/modals/EmergencyKitModal').then((module) => ({ default: module.EmergencyKitModal })));
const ImportModal = lazy(() => import('./components/modals/ImportModal').then((module) => ({ default: module.ImportModal })));
const EncryptedBackupModal = lazy(() => import('./components/modals/EncryptedBackupModal').then((module) => ({ default: module.EncryptedBackupModal })));
const EnvExportModal = lazy(() => import('./components/modals/EnvExportModal').then((module) => ({ default: module.EnvExportModal })));

const DashboardView = lazy(() => import('./components/views/DashboardView').then((module) => ({ default: module.DashboardView })));
const EmailsView = lazy(() => import('./components/views/EmailsView').then((module) => ({ default: module.EmailsView })));
const PlatformsView = lazy(() => import('./components/views/PlatformsView').then((module) => ({ default: module.PlatformsView })));
const ProspectsView = lazy(() => import('./components/views/ProspectsView').then((module) => ({ default: module.ProspectsView })));
const MapCaptureView = lazy(() => import('./components/views/MapCaptureView').then((module) => ({ default: module.MapCaptureView })));
const PasswordsView = lazy(() => import('./components/views/PasswordsView').then((module) => ({ default: module.PasswordsView })));
const GraphView = lazy(() => import('./components/views/GraphView').then((module) => ({ default: module.GraphView })));
const WriteupsView = lazy(() => import('./components/writeups/WriteupsView').then((module) => ({ default: module.WriteupsView })));
const SubscriptionsView = lazy(() => import('./components/views/SubscriptionsView').then((module) => ({ default: module.SubscriptionsView })));
const TrashView = lazy(() => import('./components/views/TrashView').then((module) => ({ default: module.TrashView })));
const SettingsView = lazy(() => import('./components/views/SettingsView').then((module) => ({ default: module.SettingsView })));
const SecurityAuditView = lazy(() => import('./components/views/SecurityAuditView').then((module) => ({ default: module.SecurityAuditView })));
const AuditLogsView = lazy(() => import('./components/views/AuditLogsView').then((module) => ({ default: module.AuditLogsView })));

const MainLayout: React.FC = () => {
  const {
    activeSection,
    toasts,
    dismissToast,
    canvasStyle,
    accentColor,
    selectedEntity,
    isUnlockModalOpen,
    isPasswordGenOpen,
    isCommandPaletteOpen,
    isEmergencyKitOpen,
    isImportModalOpen,
    isEncryptedBackupOpen,
    isEnvExportOpen,
    isEmailModalOpen,
    isPlatformModalOpen,
    isProspectModalOpen,
    isPaymentModalOpen,
  } = useVault();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const wasMobileNavOpen = useRef(false);

  const canvasClass = canvasStyle === 'dot-grid' ? 'dot-grid-canvas' : canvasStyle === 'subtle-grid' ? 'subtle-grid' : '';

  const renderSection = () => {
    switch (activeSection) {
      case 'dashboard':
        return <DashboardView />;
      case 'emails':
        return <EmailsView />;
      case 'platforms':
        return <PlatformsView />;
      case 'capture':
        return <MapCaptureView />;
      case 'prospects':
        return <ProspectsView />;
      case 'passwords':
        return <PasswordsView />;
      case 'graph':
        return <GraphView />;
      case 'writeups':
        return <WriteupsView />;
      case 'subscriptions':
        return <SubscriptionsView />;
      case 'security_audit':
        return <SecurityAuditView />;
      case 'audit_logs':
        return <AuditLogsView />;
      case 'trash':
        return <TrashView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <DashboardView />;
    }
  };

  useEffect(() => {
    if (!mobileNavOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileNavOpen]);

  useEffect(() => {
    if (wasMobileNavOpen.current && !mobileNavOpen) menuTriggerRef.current?.focus();
    wasMobileNavOpen.current = mobileNavOpen;
  }, [mobileNavOpen]);

  return (
    <div 
      className={`flex h-[100dvh] min-h-[100dvh] w-full overflow-hidden bg-obsidian-bg text-obsidian-text ${canvasClass}`}
      style={{ ['--brand-accent' as any]: accentColor }}
    >
      {/* Zone 1: Left Sidebar (Collapsible) */}
      <Sidebar isMobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Cerrar menú de navegación"
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-40 bg-black/65 backdrop-blur-[2px] lg:hidden"
        />
      )}

      {/* Zone 2: Main Workspace */}
      <div className="flex min-w-0 min-h-0 flex-1 flex-col overflow-hidden">
        <Topbar onMenuClick={() => setMobileNavOpen(true)} menuTriggerRef={menuTriggerRef} />
        <main className="min-w-0 min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <Suspense fallback={<div className="p-6 text-sm text-obsidian-muted" role="status">Cargando vista…</div>}>
            {renderSection()}
          </Suspense>
        </main>
      </div>

      {/* Zone 3: Sliding Right Inspector */}
      {selectedEntity && (
        <Suspense fallback={null}>
          <InspectorDrawer />
        </Suspense>
      )}

      {/* Floating Modals */}
      <Suspense fallback={null}>
        {isUnlockModalOpen && <VaultUnlockModal />}
        {isPasswordGenOpen && <PasswordGeneratorModal />}
        {isCommandPaletteOpen && <CommandPalette />}
        {isEmailModalOpen && <EmailModal />}
        {isPlatformModalOpen && <PlatformModal />}
        {isProspectModalOpen && <ProspectModal />}
        {isPaymentModalOpen && <PaymentModal />}
        {isEmergencyKitOpen && <EmergencyKitModal />}
        {isImportModalOpen && <ImportModal />}
        {isEncryptedBackupOpen && <EncryptedBackupModal />}
        {isEnvExportOpen && <EnvExportModal />}
      </Suspense>

      {/* Global Toast Container */}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6"
        aria-atomic="false"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.type === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto p-3.5 rounded-xl border shadow-2xl backdrop-blur-md text-xs font-medium flex items-center justify-between gap-3 transition-all animate-slideUp ${
              toast.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
                : toast.type === 'warning'
                ? 'bg-amber-950/90 border-amber-500/40 text-amber-200'
                : toast.type === 'error'
                ? 'bg-rose-950/90 border-rose-500/40 text-rose-200'
                : 'bg-obsidian-panel/95 border-obsidian-borderLight text-white'
            }`}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              aria-label="Cerrar notificación"
              className="shrink-0 rounded p-1 text-white/50 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <span aria-hidden="true" className="text-sm font-bold">&times;</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function App() {
  return (
    <VaultProvider>
      <MainLayout />
    </VaultProvider>
  );
}
