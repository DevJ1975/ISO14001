// Tiny dependency-free IndexedDB wrapper used by the offline-first field store.
// Metadata snapshots live in the "meta" store; photo blobs live in "blobs".
const DB_NAME = 'trainovate-field';
const DB_VERSION = 1;
const STORES = ['meta', 'blobs'] as const;
type StoreName = (typeof STORES)[number];

export const idbAvailable = typeof indexedDB !== 'undefined';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store);
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(store: StoreName, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const request = op(tx.objectStore(store));
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => reject(request.error);
      }),
  );
}

export async function idbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  if (!idbAvailable) return undefined;
  try {
    return await run<T>(store, 'readonly', (s) => s.get(key));
  } catch {
    return undefined;
  }
}

export async function idbSet(store: StoreName, key: string, value: unknown): Promise<void> {
  if (!idbAvailable) return;
  try {
    await run(store, 'readwrite', (s) => s.put(value as never, key));
  } catch {
    /* best-effort persistence */
  }
}

export async function idbDelete(store: StoreName, key: string): Promise<void> {
  if (!idbAvailable) return;
  try {
    await run(store, 'readwrite', (s) => s.delete(key));
  } catch {
    /* best-effort */
  }
}
