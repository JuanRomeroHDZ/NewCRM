import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { CopyButton } from './CopyButton';
import { useVault } from '../../context/VaultContext';

interface SecretFieldProps {
  value?: string;
  masked?: string;
  label?: string;
  allowRevealOverride?: boolean;
  className?: string;
}

export const SecretField: React.FC<SecretFieldProps> = ({
  value,
  masked = '••••••••',
  label = 'Contraseña',
  allowRevealOverride,
  className = ''
}) => {
  const { allowRevealPasswords } = useVault();
  const [revealed, setRevealed] = useState(false);

  const canReveal = allowRevealOverride ?? allowRevealPasswords;

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-obsidian-surface border border-obsidian-border group ${className}`}>
      <span className="font-mono text-xs text-obsidian-text tracking-wider select-all">
        {revealed && value ? value : masked}
      </span>

      <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
        {canReveal && value && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setRevealed(!revealed);
            }}
            title={revealed ? 'Ocultar' : 'Revelar en pantalla'}
            className="p-1 text-obsidian-muted hover:text-white rounded hover:bg-obsidian-border transition-colors"
          >
            {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        )}

        <CopyButton value={value || ''} label={label} size="sm" />
      </div>
    </div>
  );
};
