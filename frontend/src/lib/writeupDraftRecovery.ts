// Local drafts are encrypted with a key derived from the vault password. Neither
// the password nor the key is persisted, and the per-browser salt is not secret.
const SALT_KEY = 'lessso.writeup-draft.salt.v1';
const V1_PREFIX = 'lessso.writeup-draft.v1.';
const V2_PREFIX = 'lessso.writeup-draft.v2.';
const encoder = new TextEncoder();
// Unique to this JavaScript page lifetime. Duplicated tabs and reloads therefore
// never overwrite each other's pending copy.
const writerId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? crypto.randomUUID()
  : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const encode = (bytes: Uint8Array) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
};
const decode = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));

const transformBytes = async (bytes: Uint8Array, kind: 'gzip' | 'gunzip'): Promise<Uint8Array<ArrayBuffer> | null> => {
  const Transform = kind === 'gzip' ? globalThis.CompressionStream : globalThis.DecompressionStream;
  if (typeof Transform !== 'function') return null;
  const input = bytes.slice().buffer as ArrayBuffer;
  const stream = new Blob([input]).stream().pipeThrough(new Transform('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

export async function deriveDraftKey(password: string, storage: Storage = localStorage): Promise<CryptoKey> {
  const getOrCreateSalt = () => {
    const existing = storage.getItem(SALT_KEY);
    if (existing) return existing;
    const created = encode(crypto.getRandomValues(new Uint8Array(16)));
    storage.setItem(SALT_KEY, created);
    // Re-read the synchronous store in case another tab initialized it at the
    // same time; Web Locks below serializes this path in current browsers.
    return storage.getItem(SALT_KEY) || created;
  };
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  const salt = locks?.request
    ? await locks.request(SALT_KEY, getOrCreateSalt)
    : getOrCreateSalt();
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: decode(salt), iterations: 310000, hash: 'SHA-256' },
    material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

export async function encryptDraft(key: CryptoKey, id: string, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const serialized = encoder.encode(JSON.stringify(value));
  let plaintext = serialized;
  let version = 1;
  try {
    const compressed = await transformBytes(serialized, 'gzip');
    if (compressed && compressed.length < serialized.length) {
      plaintext = compressed;
      version = 2;
    }
  } catch {
    // A local compression problem must not block recovery; encrypt the original.
  }
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(id) }, key, plaintext,
  );
  return JSON.stringify({ version, iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)) });
}

export type DraftCopy = { storageKey: string; reportId: string; legacy: boolean; raw: string };

export function draftStorageKey(reportId: string): string {
  return `${V2_PREFIX}${encodeURIComponent(reportId)}.${writerId}`;
}

export function listDraftCopies(reportId: string, storage: Storage = localStorage): DraftCopy[] {
  const encodedId = encodeURIComponent(reportId);
  const v2Prefix = `${V2_PREFIX}${encodedId}.`;
  const legacyKey = `${V1_PREFIX}${reportId}`;
  const copies: DraftCopy[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const storageKey = storage.key(index);
    if (!storageKey) continue;
    const legacy = storageKey === legacyKey;
    if (!legacy && !storageKey.startsWith(v2Prefix)) continue;
    const raw = storage.getItem(storageKey);
    if (raw) copies.push({ storageKey, reportId, legacy, raw });
  }
  return copies;
}

export async function readDraft<T>(key: CryptoKey, copy: Pick<DraftCopy, 'storageKey' | 'reportId' | 'legacy'>, storage: Storage = localStorage): Promise<T | null> {
  const raw = storage.getItem(copy.storageKey);
  if (!raw) return null;
  const data = JSON.parse(raw);
  if (![1, 2].includes(data.version) || typeof data.iv !== 'string' || typeof data.ciphertext !== 'string') throw new Error('Copia local inválida');
  const decrypted = new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decode(data.iv), additionalData: encoder.encode(copy.legacy ? copy.reportId : copy.storageKey) }, key, decode(data.ciphertext),
  ));
  const plain = data.version === 2 ? await transformBytes(decrypted, 'gunzip') : decrypted;
  if (!plain) throw new Error('Este navegador no puede descomprimir la copia local cifrada.');
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

export function storeEncryptedDraft(storageKey: string, ciphertext: string, storage: Storage = localStorage): void {
  storage.setItem(storageKey, ciphertext);
}

export function removeDraft(storageKey: string, storage: Storage = localStorage): boolean {
  try {
    storage.removeItem(storageKey);
    return storage.getItem(storageKey) === null;
  } catch {
    return false;
  }
}
