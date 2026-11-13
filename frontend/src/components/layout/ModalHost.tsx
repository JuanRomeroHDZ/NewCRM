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

export const ModalHost: React.FC = () => {
  const {
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

  return (
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
  );
};
