import React from 'react';
import { LucideIcon, RefreshCw } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'neutral' | 'error';
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  tone = 'neutral',
  className = '',
}) => {
  const isError = tone === 'error';
  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={`flex min-w-0 flex-col items-center justify-center p-5 text-center text-obsidian-text sm:p-8 ${
        isError ? 'text-rose-200' : ''
      } ${className}`}
    >
      <Icon size={20} className={isError ? 'text-rose-400' : 'text-obsidian-muted'} aria-hidden="true" />
      <h3 className="mt-3 text-sm font-semibold text-white">{title}</h3>
      {description && (
        <p className="mt-1 max-w-md break-words text-xs leading-relaxed text-obsidian-muted">{description}</p>
      )}
      {actionLabel && onAction && (
        /* [Acción principal / secundaria] El estado vacío ofrece alta o reintento. */
        <button
          type="button"
          onClick={onAction}
          className={`mt-4 ${isError ? 'ui-action-secondary' : 'ui-action-primary'}`}
        >
          {isError && <RefreshCw size={13} aria-hidden="true" />}
          <span>{actionLabel}</span>
        </button>
      )}
    </div>
  );
};
