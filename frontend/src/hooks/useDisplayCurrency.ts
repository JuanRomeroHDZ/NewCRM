import { useCallback, useSyncExternalStore } from 'react';

type DisplayCurrency = 'MXN' | 'USD';
const key = 'lessso.displayCurrency';
const eventName = 'lessso:display-currency';

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(eventName, callback);
  return () => { window.removeEventListener('storage', callback); window.removeEventListener(eventName, callback); };
}

function snapshot(): string {
  try { return window.localStorage.getItem(key) || ''; } catch { return ''; }
}

/** Moneda de presentación compartida; los registros conservan su moneda original. */
export function useDisplayCurrency(fallback: string): [DisplayCurrency, (currency: string) => void] {
  const stored = useSyncExternalStore(subscribe, snapshot, () => '');
  const currency: DisplayCurrency = stored === 'USD' || stored === 'MXN' ? stored : fallback === 'USD' ? 'USD' : 'MXN';
  const setCurrency = useCallback((next: string) => {
    if (next !== 'MXN' && next !== 'USD') return;
    try { window.localStorage.setItem(key, next); } catch { return; }
    window.dispatchEvent(new Event(eventName));
  }, []);
  return [currency, setCurrency];
}
