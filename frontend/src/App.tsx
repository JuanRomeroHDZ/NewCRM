import React from 'react';
import { VaultProvider, useVault } from './context/VaultContext';
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { InspectorDrawer } from './components/layout/InspectorDrawer';

// Modals
import { VaultUnlockModal } from './components/common/VaultUnlockModal';
import { PasswordGeneratorModal } from './components/common/PasswordGeneratorModal';
import { CommandPalette } from './components/common/CommandPalette';
import { EmailModal } from './components/modals/EmailModal';
import { PlatformModal } from './components/modals/PlatformModal';
import { ProspectModal } from './components/modals/ProspectModal';
import { PaymentModal } from './components/modals/PaymentModal';
import { EmergencyKitModal } from './components/modals/EmergencyKitModal';
import { ImportModal } from './components/modals/ImportModal';
import { EncryptedBackupModal } from './components/modals/EncryptedBackupModal';
import { EnvExportModal } from './components/modals/EnvExportModal';

// Views
import { DashboardView } from './components/views/DashboardView';
import { EmailsView } from './components/views/EmailsView';
import { PlatformsView } from './components/views/PlatformsView';
import { ProspectsView } from './components/views/ProspectsView';
import { PasswordsView } from './components/views/PasswordsView';
import { GraphView } from './components/views/GraphView';
import { SubscriptionsView } from './components/views/SubscriptionsView';
import { TrashView } from './components/views/TrashView';
import { SettingsView } from './components/views/SettingsView';
import { SecurityAuditView } from './components/views/SecurityAuditView';
import { AuditLogsView } from './components/views/AuditLogsView';

const MainLayout: React.FC = () => {
  const { activeSection, toasts, dismissToast, canvasStyle, accentColor } = useVault();

  const canvasClass = canvasStyle === 'dot-grid' ? 'dot-grid-canvas' : canvasStyle === 'subtle-grid' ? 'subtle-grid' : '';

  const renderSection = () => {
    switch (activeSection) {
      case 'dashboard':
        return <DashboardView />;
      case 'emails':
        return <EmailsView />;
      case 'platforms':
        return <PlatformsView />;
      case 'prospects':
        return <ProspectsView />;
      case 'passwords':
        return <PasswordsView />;
      case 'graph':
        return <GraphView />;
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

  return (
    <div 
      className={`flex h-screen w-screen overflow-hidden bg-obsidian-bg text-obsidian-text ${canvasClass}`}
      style={{ ['--brand-accent' as any]: accentColor }}
    >
      {/* Zone 1: Left Sidebar (Collapsible) */}
      <Sidebar />

      {/* Zone 2: Main Workspace */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          {renderSection()}
        </main>
      </div>

      {/* Zone 3: Sliding Right Inspector */}
      <InspectorDrawer />

      {/* Floating Modals */}
      <VaultUnlockModal />
      <PasswordGeneratorModal />
      <CommandPalette />
      <EmailModal />
      <PlatformModal />
      <ProspectModal />
      <PaymentModal />
      <EmergencyKitModal />
      <ImportModal />
      <EncryptedBackupModal />
      <EnvExportModal />

      {/* Global Toast Container */}
      <div 
        className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm pointer-events-none"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            onClick={() => dismissToast(toast.id)}
            className={`pointer-events-auto p-3.5 rounded-xl border shadow-2xl backdrop-blur-md text-xs font-medium flex items-center justify-between gap-3 cursor-pointer transition-all animate-slideUp ${
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
            <span className="text-white/40 hover:text-white text-sm font-bold">&times;</span>
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
