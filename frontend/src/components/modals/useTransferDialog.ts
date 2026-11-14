import { useEffect, useRef } from 'react';

/** Keep transfer dialogs keyboard-contained while preserving the caller's focus. */
export const useTransferDialog = (open: boolean, close: () => void, busy = false) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const state = useRef({ close, busy });
  state.current = { close, busy };
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const controls = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'
    ) || []).filter((element) => element.getClientRects().length > 0);
    const frame = requestAnimationFrame(() => (controls()[0] || dialogRef.current)?.focus());
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!state.current.busy) state.current.close();
      }
      if (event.key !== 'Tab') return;
      const elements = controls();
      if (!elements.length) { event.preventDefault(); dialogRef.current?.focus(); return; }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!dialogRef.current?.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', keyDown, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', keyDown, true);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);
  return dialogRef;
};
