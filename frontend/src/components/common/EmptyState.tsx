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
      className={`flex min-w-0 flex-col items-center justify-center rounded-2xl border p-5 text-center sm:p-8 ${
        isError
          ? 'border-rose-500/30 bg-rose-950/20 text-rose-100'
          : 'border-obsidian-border bg-obsidian-panel/70 text-obsidian-text'
      } ${className}`}
    >
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${
          isError
            ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
            : 'border-obsidian-borderLight bg-obsidian-surface text-obsidian-muted'
        }`}
        aria-hidden="true"
      >
        <Icon size={22} />
      </div>
      <h3 className="mt-3 text-sm font-semibold text-white">{title}</h3>
      {description && (
        <p className="mt-1 max-w-md break-words text-xs leading-relaxed text-obsidian-muted">{description}</p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className={`mt-4 inline-flex min-h-[40px] items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 ${
            isError
              ? 'border border-rose-500/40 bg-rose-600/20 text-rose-200 hover:bg-rose-600/30 focus-visible:ring-rose-400'
              : 'bg-brand-600 text-white hover:bg-brand-500 focus-visible:ring-brand-400'
          }`}
        >
          {isError && <RefreshCw size={13} aria-hidden="true" />}
          <span>{actionLabel}</span>
        </button>
      )}
    </div>
  );
};
