import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface InlineErrorNoticeProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const InlineErrorNotice: React.FC<InlineErrorNoticeProps> = ({
  title,
  description,
  actionLabel,
  onAction,
}) => (
  <div
    role="alert"
    className="flex min-w-0 flex-wrap items-start justify-between gap-3 rounded-lg border border-obsidian-border bg-obsidian-surface p-3 text-obsidian-text"
  >
    <div className="flex min-w-0 items-start gap-2.5">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-300" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 break-words text-xs leading-relaxed text-obsidian-muted">{description}</p>
      </div>
    </div>
    {actionLabel && onAction && (
      /* [Acción secundaria] Reintentar la operación que falló. */
      <button
        type="button"
        onClick={onAction}
        className="ui-action-secondary shrink-0"
      >
        <RefreshCw size={16} aria-hidden="true" />
        {actionLabel}
      </button>
    )}
  </div>
);
