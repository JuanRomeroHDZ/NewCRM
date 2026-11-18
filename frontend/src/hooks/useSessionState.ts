import { useEffect, useState } from 'react';

/** Conserva una preferencia de interfaz durante la vida de la pestaña. */
export function useSessionState<T>(key: string, fallback: T, parse: (value: unknown) => T | undefined) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(key);
      return stored === null ? fallback : parse(JSON.parse(stored)) ?? fallback;
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* La navegación sigue disponible. */ }
  }, [key, value]);

  return [value, setValue] as const;
}
