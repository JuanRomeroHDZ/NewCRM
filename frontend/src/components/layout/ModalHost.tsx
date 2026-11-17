import React, { lazy, Suspense } from 'react';
import { useVault } from '../../context/VaultContext';

const VaultUnlockModal = lazy(() => import('../common/VaultUnlockModal').then((module) => ({ default: module.VaultUnlockModal })));
const PasswordGeneratorModal = lazy(() => import('../common/PasswordGeneratorModal').then((module) => ({ default: module.PasswordGeneratorModal })));
const CommandPalette = lazy(() => import('../common/CommandPalette').then((module) => ({ default: module.CommandPalette })));
const EmailModal = lazy(() => import('../modals/EmailModal').then((module) => ({ default: module.EmailModal })));
const PlatformModal = lazy(() => import('../modals/PlatformModal').then((module) => ({ default: module.PlatformModal })));
const ProspectModal = lazy(() => import('../modals/ProspectModal').then((module) => ({ default: module.ProspectModal })));
const PaymentModal = lazy(() => import('../modals/PaymentModal').then((module) => ({ default: module.PaymentModal })));
const EmergencyKitModal = lazy(() => import('../modals/EmergencyKitModal').then((module) => ({ default: module.EmergencyKitModal })));
const ImportModal = lazy(() => import('../modals/ImportModal').then((module) => ({ default: module.ImportModal })));
const EncryptedBackupModal = lazy(() => import('../modals/EncryptedBackupModal').then((module) => ({ default: module.EncryptedBackupModal })));
const EnvExportModal = lazy(() => import('../modals/EnvExportModal').then((module) => ({ default: module.EnvExportModal })));

const ModalLoading: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const loadingRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { loadingRef.current?.focus(); }, []);
  return (
    <div
      ref={loadingRef}
      tabIndex={-1}
      role="status"
      aria-label="Cargando ventana"
      onKeyDown={(event) => {
        if (event.key === 'Tab') event.preventDefault();
        if (event.key === 'Escape') onClose();
      }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
    >
      <div className="rounded-xl border border-obsidian-border bg-obsidian-panel px-5 py-4 text-sm text-obsidian-text">Cargando ventana…</div>
    </div>
  );
};

class ModalLoadBoundary extends React.Component<
  { children: React.ReactNode; onClose: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  private dialogRef = React.createRef<HTMLDivElement>();

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(_: Readonly<{ children: React.ReactNode; onClose: () => void }>, previousState: Readonly<{ failed: boolean }>) {
    if (!previousState.failed && this.state.failed) this.dialogRef.current?.querySelector('button')?.focus();
  }

  private handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.props.onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const buttons = this.dialogRef.current?.querySelectorAll('button');
    if (!buttons?.length) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4">
        <div ref={this.dialogRef} onKeyDown={this.handleKeyDown} role="alertdialog" aria-modal="true" aria-labelledby="modal-load-error-title" className="w-full max-w-md rounded-xl border border-obsidian-border bg-obsidian-panel p-5 text-obsidian-text">
          <h2 id="modal-load-error-title" className="font-serif text-lg font-semibold text-white">No se pudo abrir la ventana</h2>
          <p className="mt-2 text-sm text-obsidian-muted">La vista no terminó de cargarse. Puedes cerrarla o recargar la aplicación.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={this.props.onClose} className="min-h-[44px] rounded-lg border border-obsidian-border px-4 text-sm text-white hover:bg-obsidian-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">Cerrar</button>
            <button type="button" onClick={() => window.location.reload()} className="min-h-[44px] rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">Recargar</button>
          </div>
        </div>
      </div>
    );
  }
}

export const ModalHost: React.FC = () => {
  const {
    isUnlockModalOpen,
    closeUnlockModal,
    isPasswordGenOpen,
    closePasswordGen,
    isCommandPaletteOpen,
    closeCommandPalette,
    isEmergencyKitOpen,
    closeEmergencyKit,
    isImportModalOpen,
    closeImportModal,
    isEncryptedBackupOpen,
    closeEncryptedBackup,
    isEnvExportOpen,
    closeEnvExport,
    isEmailModalOpen,
    closeEmailModal,
    isPlatformModalOpen,
    closePlatformModal,
    isProspectModalOpen,
    closeProspectModal,
    isPaymentModalOpen,
    closePaymentModal,
  } = useVault();

  const modals = [
    { id: 'unlock', open: isUnlockModalOpen, close: closeUnlockModal, content: <VaultUnlockModal /> },
    { id: 'password', open: isPasswordGenOpen, close: closePasswordGen, content: <PasswordGeneratorModal /> },
    { id: 'commands', open: isCommandPaletteOpen, close: closeCommandPalette, content: <CommandPalette /> },
    { id: 'email', open: isEmailModalOpen, close: closeEmailModal, content: <EmailModal /> },
    { id: 'platform', open: isPlatformModalOpen, close: closePlatformModal, content: <PlatformModal /> },
    { id: 'prospect', open: isProspectModalOpen, close: closeProspectModal, content: <ProspectModal /> },
    { id: 'payment', open: isPaymentModalOpen, close: closePaymentModal, content: <PaymentModal /> },
    { id: 'emergency', open: isEmergencyKitOpen, close: closeEmergencyKit, content: <EmergencyKitModal /> },
    { id: 'import', open: isImportModalOpen, close: closeImportModal, content: <ImportModal /> },
    { id: 'backup', open: isEncryptedBackupOpen, close: closeEncryptedBackup, content: <EncryptedBackupModal /> },
    { id: 'environment', open: isEnvExportOpen, close: closeEnvExport, content: <EnvExportModal /> },
  ];

  return (
    <>
      {modals.filter((modal) => modal.open).map((modal) => (
        <ModalLoadBoundary key={modal.id} onClose={modal.close}>
          <Suspense fallback={<ModalLoading onClose={modal.close} />}>{modal.content}</Suspense>
        </ModalLoadBoundary>
      ))}
    </>
  );
};
