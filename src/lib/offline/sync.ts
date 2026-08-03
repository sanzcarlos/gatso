import { apiFetch } from "@/lib/api/client-fetch";
import type { CreateExpenseInput } from "@/lib/validation/expenses";
import {
  addPendingExpense,
  listPendingExpenses,
  removePendingExpense,
  updatePendingExpense,
  type PendingExpense,
} from "./db";

type Listener = () => void;

const listeners = new Set<Listener>();
let syncing = false;

/**
 * Notifica a los componentes montados (banners, contadores de
 * pendientes) cuando cambia el estado de la cola offline, sin depender
 * de una libreria de estado global: cada pantalla se suscribe con
 * `subscribePendingExpenses` y vuelve a leer `listPendingExpenses`.
 */
export function subscribePendingExpenses(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) listener();
}

export interface SyncResult {
  synced: number;
  failed: number;
}

/**
 * Reenvia la cola de gastos pendientes creados sin conexion (Fase 10).
 * Se detiene en el primer error de red (probablemente seguimos offline)
 * pero continua con el resto de la cola si un gasto concreto es
 * rechazado por el servidor (p. ej. datos invalidos), marcandolo como
 * error para que el usuario decida si lo corrige o lo descarta.
 */
export async function syncPendingExpenses(): Promise<SyncResult> {
  if (syncing) return { synced: 0, failed: 0 };
  if (typeof navigator !== "undefined" && !navigator.onLine) return { synced: 0, failed: 0 };

  syncing = true;
  let synced = 0;
  let failed = 0;
  try {
    const pending = await listPendingExpenses();
    for (const item of pending) {
      if (item.status === "syncing") continue;
      const result = await syncOne(item);
      if (result === "synced") synced += 1;
      else if (result === "failed") failed += 1;
      else break; // error de red: probablemente seguimos sin conexion, no seguir intentando
    }
  } finally {
    syncing = false;
    notify();
  }
  return { synced, failed };
}

async function syncOne(item: PendingExpense): Promise<"synced" | "failed" | "offline"> {
  await updatePendingExpense(item.localId, { status: "syncing" });
  try {
    const response = await apiFetch(`/api/groups/${item.groupId}/expenses`, {
      method: "POST",
      body: JSON.stringify(item.payload),
    });
    if (response.ok) {
      await removePendingExpense(item.localId);
      return "synced";
    }
    const data = await response.json().catch(() => ({}));
    await updatePendingExpense(item.localId, {
      status: "error",
      errorMessage: data.error ?? "El servidor rechazo este gasto",
    });
    return "failed";
  } catch {
    await updatePendingExpense(item.localId, { status: "pending" });
    return "offline";
  }
}

export async function discardPendingExpense(localId: string): Promise<void> {
  await removePendingExpense(localId);
  notify();
}

/** Encola un gasto creado sin conexion y avisa a las pantallas suscritas. */
export async function queuePendingExpense(groupId: string, payload: CreateExpenseInput): Promise<PendingExpense> {
  const pending = await addPendingExpense({ groupId, payload });
  notify();
  return pending;
}

export { listPendingExpenses } from "./db";
export type { PendingExpense } from "./db";
