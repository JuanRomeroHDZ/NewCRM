import { useEffect, useRef } from 'react';

/** Keeps keyboard navigation in the uppermost form, including nested dialogs. */
export function useFormModalFocus(open: boolean, titleId: string, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.getElementById(titleId)?.closest<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    const elements = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')).filter(el => el.getClientRects().length > 0 && !el.closest('[hidden], [inert]'));
    const timer = window.setTimeout(() => { if (!dialog.contains(document.activeElement)) elements()[0]?.focus(); }, 0);
    const onKeyDown = (event: KeyboardEvent) => {
      // A separately mounted child dialog owns its keyboard events, regardless of DOM order.
      if (!(event.target instanceof Node) || !dialog.contains(event.target)) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const targets = elements();
      const first = targets[0], last = targets[targets.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (!dialog.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown, true);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open, titleId]);
}
