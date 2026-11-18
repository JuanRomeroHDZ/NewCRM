import type { ReportDocumentStatus, ReportRecoveryDraftPayload, ReportRecoverySourceResponse } from '../../types';

export interface TypstRecoverySnapshot {
  id: string;
  documentId: string;
  createdAt: number;
  ciphertext: string;
}

export interface TypstRecoveryDraft {
  title: string;
  status: ReportDocumentStatus;
  prospectId: string;
  projectId: string;
  source: string;
}

export const serializeTypstRecoveryDraft = (draft: TypstRecoveryDraft) => JSON.stringify(draft);

export const toReportRecoveryPayload = (draft: TypstRecoveryDraft): ReportRecoveryDraftPayload => ({
  title: draft.title,
  status: draft.status,
  prospect_id: draft.prospectId || null,
  project_id: draft.projectId || null,
  source: draft.source,
});

export const fromReportRecoveryResponse = (
  recovered: ReportRecoverySourceResponse,
  fallback: TypstRecoveryDraft,
): TypstRecoveryDraft => recovered.version === 2
  ? {
      title: recovered.title || fallback.title,
      status: recovered.status || fallback.status,
      prospectId: recovered.prospect_id || '',
      projectId: recovered.project_id || '',
      source: recovered.source,
    }
  : { ...fallback, source: recovered.source };

const DATABASE_NAME = 'lessso-typst-recovery';
const STORE_NAME = 'snapshots';
const MAX_SNAPSHOTS_PER_DOCUMENT = 12;
let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('El navegador no permite guardar el historial local.'));
  }
  if (databasePromise) return databasePromise;
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.objectStoreNames.contains(STORE_NAME)
        ? request.transaction?.objectStore(STORE_NAME)
        : database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      if (store && !store.indexNames.contains('documentId')) {
        store.createIndex('documentId', 'documentId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir el historial local.'));
    request.onblocked = () => reject(new Error('Cierra otras pestañas de LESSSO para actualizar el historial local.'));
  }).catch((error) => {
    databasePromise = null;
    throw error;
  });
  return databasePromise!;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo leer el historial local.'));
  });
}

export async function listTypstRecoverySnapshots(documentId: string): Promise<TypstRecoverySnapshot[]> {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readonly');
  const index = transaction.objectStore(STORE_NAME).index('documentId');
  const snapshots = await requestResult(index.getAll(documentId)) as TypstRecoverySnapshot[];
  return snapshots.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveTypstRecoverySnapshot(
  documentId: string,
  ciphertext: string,
  createdAt = Date.now(),
): Promise<TypstRecoverySnapshot[]> {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  const index = store.index('documentId');
  const snapshot: TypstRecoverySnapshot = {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${createdAt}-${Math.random().toString(36).slice(2)}`,
    documentId,
    createdAt,
    ciphertext,
  };
  let nextSnapshots: TypstRecoverySnapshot[] = [];
  await new Promise<void>((resolve, reject) => {
    const request = index.getAll(documentId);
    request.onsuccess = () => {
      const current = request.result as TypstRecoverySnapshot[];
      current.sort((a, b) => b.createdAt - a.createdAt);
      store.put(snapshot);
      current.slice(MAX_SNAPSHOTS_PER_DOCUMENT - 1).forEach((older) => store.delete(older.id));
      nextSnapshots = [snapshot, ...current].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_SNAPSHOTS_PER_DOCUMENT);
    };
    request.onerror = () => reject(request.error ?? new Error('No se pudo leer el historial local.'));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('No se pudo guardar la copia local.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Se canceló el guardado de la copia local.'));
  });
  return nextSnapshots;
}

export async function deleteTypstRecoverySnapshots(documentId: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  const request = store.index('documentId').getAllKeys(documentId);
  await new Promise<void>((resolve, reject) => {
    request.onsuccess = () => request.result.forEach((key) => store.delete(key));
    request.onerror = () => reject(request.error ?? new Error('No se pudo leer el historial local.'));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('No se pudo eliminar el historial local.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Se canceló la eliminación del historial local.'));
  });
}
