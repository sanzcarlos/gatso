import type { CreateExpenseInput } from "@/lib/validation/expenses";

const DB_NAME = "gatso-offline";
const DB_VERSION = 1;
const CACHE_STORE = "cache";
const QUEUE_STORE = "pending-expenses";

export interface PendingExpense {
  localId: string;
  groupId: string;
  payload: CreateExpenseInput;
  createdAt: number;
  status: "pending" | "syncing" | "error";
  errorMessage?: string;
}

interface CacheRecord<T> {
  key: string;
  value: T;
  updatedAt: number;
}

function isIndexedDbAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      reject(new Error("IndexedDB no disponible"));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "localId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runInStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const request = run(tx.objectStore(storeName));
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
        tx.oncomplete = () => resolve(request.result);
      }),
  );
}

/**
 * Cache de solo lectura (datos de grupos/gastos/etc.) en IndexedDB, usada
 * como respaldo cuando no hay conexion: cada pantalla guarda la ultima
 * respuesta correcta del servidor bajo una clave propia y, si el fetch
 * falla por falta de red, se relee de aqui en vez de mostrar la pantalla
 * vacia. Los errores de IndexedDB (cuota, modo privado, etc.) se ignoran
 * en silencio: la cache es una mejora, nunca un requisito para que la app
 * funcione con conexion.
 */
export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const record = await runInStore<CacheRecord<T> | undefined>(CACHE_STORE, "readonly", (store) => store.get(key));
    return record ? record.value : null;
  } catch {
    return null;
  }
}

export async function setCache<T>(key: string, value: T): Promise<void> {
  try {
    await runInStore(CACHE_STORE, "readwrite", (store) => store.put({ key, value, updatedAt: Date.now() }));
  } catch {
    // Ignorado: ver comentario de getCache.
  }
}

/**
 * Cola de gastos creados sin conexion (Fase 10 — offline-first): cada
 * entrada guarda el mismo payload que espera `POST
 * /api/groups/:groupId/expenses`, para poder reenviarlo tal cual en
 * cuanto vuelva la conexion sin duplicar la logica de validacion.
 */
export async function addPendingExpense(
  entry: Pick<PendingExpense, "groupId" | "payload">,
): Promise<PendingExpense> {
  const pending: PendingExpense = {
    ...entry,
    localId: crypto.randomUUID(),
    createdAt: Date.now(),
    status: "pending",
  };
  await runInStore(QUEUE_STORE, "readwrite", (store) => store.put(pending));
  return pending;
}

export async function listPendingExpenses(groupId?: string): Promise<PendingExpense[]> {
  try {
    const all = await runInStore<PendingExpense[]>(QUEUE_STORE, "readonly", (store) => store.getAll());
    const sorted = all.sort((a, b) => b.createdAt - a.createdAt);
    return groupId ? sorted.filter((item) => item.groupId === groupId) : sorted;
  } catch {
    return [];
  }
}

export async function removePendingExpense(localId: string): Promise<void> {
  try {
    await runInStore(QUEUE_STORE, "readwrite", (store) => store.delete(localId));
  } catch {
    // Ignorado: ver comentario de getCache.
  }
}

export async function updatePendingExpense(localId: string, patch: Partial<PendingExpense>): Promise<void> {
  try {
    await runInStore<PendingExpense | undefined>(QUEUE_STORE, "readwrite", (store) => {
      const getRequest = store.get(localId);
      getRequest.onsuccess = () => {
        const current = getRequest.result;
        if (current) store.put({ ...current, ...patch });
      };
      return getRequest;
    });
  } catch {
    // Ignorado: ver comentario de getCache.
  }
}

const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Retencion/limpieza de la cache local (Backlog: "sin borrar auditoria ni
 * datos financieros necesarios"). La cache de lectura (`CACHE_STORE`) no
 * tenia ninguna expiracion: cada pantalla la sobrescribe en cada visita
 * con conexion, pero si el usuario deja de abrir un grupo/subgrupo
 * concreto la entrada correspondiente se queda para siempre en su
 * IndexedDB. Se borra en segundo plano cualquier entrada mas antigua que
 * `CACHE_MAX_AGE_MS`; nunca afecta a `QUEUE_STORE` (cola de gastos
 * pendientes de sincronizar, que solo se borra al confirmarse el envio o
 * al descartarla explicitamente el usuario).
 */
export async function pruneStaleCache(maxAgeMs: number = CACHE_MAX_AGE_MS): Promise<void> {
  try {
    const db = await openDb();
    const cutoff = Date.now() - maxAgeMs;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, "readwrite");
      const store = tx.objectStore(CACHE_STORE);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const record = cursor.value as CacheRecord<unknown>;
        if (record.updatedAt < cutoff) cursor.delete();
        cursor.continue();
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
      tx.oncomplete = () => resolve();
    });
  } catch {
    // Ignorado: ver comentario de getCache.
  }
}
