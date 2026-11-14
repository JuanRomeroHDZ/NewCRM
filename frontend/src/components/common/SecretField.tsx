import React, { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { CopyButton } from './CopyButton';
import { useVault } from '../../context/VaultContext';

interface SecretFieldProps {
  value?: string;
  masked?: string;
  label?: string;
  allowRevealOverride?: boolean;
  className?: string;
  onCopyRequest?: () => Promise<string | null>;
  requireVaultPassword?: boolean;
}

export const SecretField: React.FC<SecretFieldProps> = ({
  value,
  masked = '••••••••',
  label = 'Contraseña',
  allowRevealOverride,
  className = '',
  onCopyRequest,
  requireVaultPassword = true,
}) => {
  const { allowRevealPasswords } = useVault();
  const [revealed, setRevealed] = useState(false);

  const canReveal = allowRevealOverride ?? allowRevealPasswords;

  useEffect(() => {
    setRevealed(false);
  }, [canReveal, value]);

  return (
    <div className={`inline-flex min-w-0 max-w-full items-center gap-1.5 px-2.5 py-1 rounded-md bg-obsidian-surface border border-obsidian-border group ${className}`}>
      <span className="min-w-0 overflow-x-auto whitespace-nowrap font-mono text-xs text-obsidian-text tracking-wider select-all">
        {canReveal && revealed && value ? value : masked}
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
            aria-label={`${revealed ? 'Ocultar' : 'Mostrar'} ${label}`}
            aria-pressed={revealed}
            className="p-1 text-obsidian-muted hover:text-white rounded hover:bg-obsidian-border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
          >
            {revealed ? <EyeOff size={13} aria-hidden="true" /> : <Eye size={13} aria-hidden="true" />}
          </button>
        )}

        <CopyButton
          value={value || ''}
          label={label}
          size="sm"
          requireVaultPassword={requireVaultPassword}
          onClickCustom={onCopyRequest}
        />
      </div>
    </div>
  );
};
