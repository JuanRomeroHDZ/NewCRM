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
    className="flex min-w-0 flex-wrap items-start justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-950/25 p-3 text-rose-100"
  >
    <div className="flex min-w-0 items-start gap-2.5">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-300" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 break-words text-xs leading-relaxed text-rose-100/80">{description}</p>
      </div>
    </div>
    {actionLabel && onAction && (
      <button
        type="button"
        onClick={onAction}
        className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 text-xs font-semibold text-rose-100 transition-colors hover:bg-rose-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-300"
      >
        <RefreshCw size={13} aria-hidden="true" />
        {actionLabel}
      </button>
    )}
  </div>
);
