import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useVault } from '../../context/VaultContext';

interface CopyButtonProps {
  value?: string;
  label?: string;
  onClickCustom?: () => Promise<string | void>;
  className?: string;
  size?: 'sm' | 'md';
}

export const CopyButton: React.FC<CopyButtonProps> = ({
  value,
  label = 'Credencial',
  onClickCustom,
  className = '',
  size = 'sm'
}) => {
  const { copyToClipboard } = useVault();
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    let textToCopy = value;

    if (onClickCustom) {
      const res = await onClickCustom();
      if (typeof res === 'string') {
        textToCopy = res;
      }
    }

    if (!textToCopy) return;

    await copyToClipboard(textToCopy, label);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const iconSize = size === 'sm' ? 14 : 16;

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Copiar ${label}`}
      className={`inline-flex items-center justify-center p-1.5 rounded-md transition-all text-obsidian-muted hover:text-white hover:bg-obsidian-surface border border-transparent hover:border-obsidian-borderLight active:scale-95 ${className} ${
        copied ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : ''
      }`}
    >
      {copied ? <Check size={iconSize} className="text-emerald-400" /> : <Copy size={iconSize} />}
    </button>
  );
};
