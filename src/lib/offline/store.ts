import type { QueueItem } from "./rules";

/**
 * The offline queue on this device: one IndexedDB object store, shared by
 * every tab. Storage failures (private windows, blocked storage) reject, and
 * callers treat that as "can't queue", which sends the request normally and
 * lets it fail visibly rather than promising a save that can't happen.
 */

const DB_NAME = "feenance-offline";
const STORE = "queue";

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Couldn't open offline storage"));
    }).catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise as Promise<IDBDatabase>;
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = work(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error ?? new Error("Offline storage failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Offline storage aborted"));
  });
}

export const queueStore = {
  all: () => run<QueueItem[]>("readonly", (store) => store.getAll()),
  put: (item: QueueItem) => run("readwrite", (store) => store.put(item)).then(() => undefined),
  remove: (id: string) => run("readwrite", (store) => store.delete(id)).then(() => undefined),
  async removeForUser(userId: string) {
    const all = await queueStore.all();
    await Promise.all(all.filter((item) => item.userId === userId).map((item) => queueStore.remove(item.id)));
  },
};
