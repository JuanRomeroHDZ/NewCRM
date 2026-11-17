import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { VaultPasswordConfirmModal } from './VaultPasswordConfirmModal';

interface CopyButtonProps {
  value?: string;
  label?: string;
  onClickCustom?: () => Promise<string | null>;
  requireVaultPassword?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}

export const CopyButton: React.FC<CopyButtonProps> = ({
  value,
  label = 'Credencial',
  onClickCustom,
  requireVaultPassword = false,
  className = '',
  size = 'sm'
}) => {
  const { copyToClipboard } = useVault();
  const [copied, setCopied] = useState(false);
  const [isPasswordPromptOpen, setIsPasswordPromptOpen] = useState(false);
  const [pendingCopyValue, setPendingCopyValue] = useState('');

  const copyValue = async (text: string) => {
    if (!text) return;
    const success = await copyToClipboard(text, label);
    if (!success) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    let textToCopy = value;

    if (onClickCustom) {
      const res = await onClickCustom();
      if (res === null) return;
      textToCopy = res;
    } else if (requireVaultPassword) {
      if (!textToCopy) return;
      setPendingCopyValue(textToCopy);
      setIsPasswordPromptOpen(true);
      return;
    }

    if (textToCopy) await copyValue(textToCopy);
  };

  const confirmProtectedCopy = async (password: string) => {
    const result = await api.verifyVaultPassword(password);
    if (!result.verified) throw new Error('No se pudo verificar la contraseña.');
    await copyValue(pendingCopyValue);
    setPendingCopyValue('');
    setIsPasswordPromptOpen(false);
  };

  const iconSize = size === 'sm' ? 14 : 16;

  return (
    <>
      {/* [Icono] Copia el valor asociado y muestra la confirmación. */}
      <button
        type="button"
        onClick={handleCopy}
        aria-haspopup={requireVaultPassword && !onClickCustom ? 'dialog' : undefined}
        title={copied ? `${label} copiado` : `Copiar ${label}`}
        aria-label={copied ? `${label} copiado` : `Copiar ${label}`}
        data-ui-state={copied ? 'success' : undefined}
        className={`ui-action-icon ${className}`}
      >
        {copied ? <Check size={iconSize} className="text-emerald-400" /> : <Copy size={iconSize} />}
      </button>
      {isPasswordPromptOpen && (
        <VaultPasswordConfirmModal
          onCancel={() => {
            setIsPasswordPromptOpen(false);
            setPendingCopyValue('');
          }}
          onConfirm={confirmProtectedCopy}
        />
      )}
    </>
  );
};
