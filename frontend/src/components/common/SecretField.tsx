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
    <div className={`inline-flex min-h-11 min-w-0 max-w-full items-center gap-1.5 rounded-md border border-obsidian-border bg-obsidian-bg px-2.5 py-1 group ${className}`}>
      <span className="min-w-0 overflow-x-auto whitespace-nowrap font-mono text-xs text-obsidian-text select-all">
        {canReveal && revealed && value ? value : masked}
      </span>

      <div className="flex items-center gap-1">
        {canReveal && value && (
          /* [Estado seleccionable] Revela u oculta el valor protegido. */
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setRevealed(!revealed);
            }}
            title={revealed ? 'Ocultar' : 'Revelar en pantalla'}
            aria-label={`${revealed ? 'Ocultar' : 'Mostrar'} ${label}`}
            aria-pressed={revealed}
            className="ui-action-icon ui-action-toggle"
          >
            {revealed ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
          </button>
        )}

        <CopyButton
          value={value || ''}
          label={label}
          size="md"
          requireVaultPassword={requireVaultPassword}
          onClickCustom={onCopyRequest}
        />
      </div>
    </div>
  );
};
