const DATABASE_NAME = 'lessso-report-collaboration';
const DATABASE_VERSION = 1;
const STORE_NAME = 'encrypted_states';
const PREFIX = 'lessso-report-collaboration-v1:';
const encoder = new TextEncoder();

function bufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export interface EncryptedCollaborativeState {
  resourceKey: string;
  generation: number;
  state: Uint8Array;
}

interface StoredState {
  id: string;
  resourceKey: string;
  generation: number;
  iv: string;
  ciphertext: string;
  updatedAt: number;
}

const toBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return btoa(binary);
};

const fromBase64 = (value: string) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir el almacenamiento local cifrado.'));
  });
}

async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = action(transaction.objectStore(STORE_NAME));
      let result: T | undefined;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error ?? new Error('Falló el almacenamiento local cifrado.'));
      transaction.oncomplete = () => resolve(result as T);
      transaction.onerror = () => reject(transaction.error ?? new Error('Falló el almacenamiento local cifrado.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Se canceló el almacenamiento local cifrado.'));
    });
  } finally {
    database.close();
  }
}

function writerId(): string {
  const runtime = globalThis as typeof globalThis & { __lesssoReportWriterId?: string };
  runtime.__lesssoReportWriterId ??= crypto.randomUUID();
  return runtime.__lesssoReportWriterId;
}

export async function saveEncryptedCollaborationState(
  key: CryptoKey,
  resourceKey: string,
  generation: number,
  state: Uint8Array,
): Promise<void> {
  const id = `${PREFIX}${encodeURIComponent(resourceKey)}:${writerId()}`;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = encoder.encode(`${resourceKey}:${generation}`);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bufferSource(iv), additionalData: bufferSource(aad) }, key, bufferSource(state));
  const record: StoredState = {
    id,
    resourceKey,
    generation,
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    updatedAt: Date.now(),
  };
  await transact('readwrite', (store) => store.put(record));
}

export async function loadEncryptedCollaborationStates(
  key: CryptoKey,
  resourceKey: string,
): Promise<EncryptedCollaborativeState[]> {
  const records = await transact<StoredState[]>('readonly', (store) => store.getAll());
  const matching = records.filter((record) => record.resourceKey === resourceKey)
    .sort((a, b) => a.updatedAt - b.updatedAt);
  const output: EncryptedCollaborativeState[] = [];
  for (const record of matching) {
    const aad = encoder.encode(`${resourceKey}:${record.generation}`);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bufferSource(fromBase64(record.iv)), additionalData: bufferSource(aad) },
      key,
      bufferSource(fromBase64(record.ciphertext)),
    );
    output.push({ resourceKey, generation: record.generation, state: new Uint8Array(plaintext) });
  }
  return output;
}

export async function clearEncryptedCollaborationStates(resourceKey: string): Promise<void> {
  const records = await transact<StoredState[]>('readonly', (store) => store.getAll());
  const matching = records.filter((record) => record.resourceKey === resourceKey).map((record) => record.id);
  if (!matching.length) return;
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      for (const id of matching) store.delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('No se pudo borrar la copia cifrada.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Se canceló el borrado de la copia cifrada.'));
    });
  } finally {
    database.close();
  }
}
