import { useEffect, useRef } from 'react';

/** Keyboard containment and focus restoration for the audited financial dialogs. */
export function useAuditedDialog(open: boolean, onClose: () => void, busy = false) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ onClose, busy });
  latest.current = { onClose, busy };
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const controls = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])') || []).filter((element) => element.getClientRects().length > 0);
    const timer = window.setTimeout(() => (dialog?.querySelector<HTMLElement>('[autofocus]') || controls()[0] || dialog)?.focus(), 0);
    const keydown = (event: KeyboardEvent) => {
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]'));
      if (dialogs[dialogs.length - 1] !== dialog) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!latest.current.busy) latest.current.onClose();
      } else if (event.key === 'Tab') {
        const elements = controls();
        const first = elements[0]; const last = elements[elements.length - 1];
        if (!first) { event.preventDefault(); dialog?.focus(); return; }
        if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', keydown, true);
    return () => {
      window.clearTimeout(timer); window.removeEventListener('keydown', keydown, true);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open]);
  return dialogRef;
}
