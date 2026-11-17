const STORAGE_KEY = 'lessso_writeup_edit_client_id_v1';
const CLIENT_ID_PATTERN = /^writeup-[A-Za-z0-9_-]{16,96}$/;

type SessionStorageLike = Pick<Storage, 'getItem' | 'setItem'>;

let memoryFallback: string | null = null;

function createClientId(): string {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return `writeup-${id}`;
}

/** Keeps one non-secret editor identity per tab across reloads. The server still
 * binds its lease to the authenticated account or vault session. */
export function getWriteupEditClientId(storage?: SessionStorageLike | null): string {
  let tabStorage = storage;
  if (tabStorage === undefined && typeof window !== 'undefined') {
    try {
      tabStorage = window.sessionStorage;
    } catch {
      tabStorage = null;
    }
  }

  if (tabStorage) {
    try {
      const existing = tabStorage.getItem(STORAGE_KEY);
      if (existing && CLIENT_ID_PATTERN.test(existing)) return existing;
      const created = createClientId();
      tabStorage.setItem(STORAGE_KEY, created);
      return created;
    } catch {
      // Storage can be disabled by browser privacy settings. Keep identity
      // stable for this page lifetime, while edit-lock recovery remains TTL-bound.
    }
  }

  memoryFallback ??= createClientId();
  return memoryFallback;
}
