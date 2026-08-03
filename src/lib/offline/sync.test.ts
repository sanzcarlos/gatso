import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PendingExpense } from "./db";
import type { CreateExpenseInput } from "@/lib/validation/expenses";

const apiFetchMock = vi.fn();
vi.mock("@/lib/api/client-fetch", () => ({ apiFetch: apiFetchMock }));

const dbMock = vi.hoisted(() => ({
  addPendingExpense: vi.fn(),
  listPendingExpenses: vi.fn(),
  removePendingExpense: vi.fn(),
  updatePendingExpense: vi.fn(),
}));
vi.mock("./db", () => dbMock);

const { syncPendingExpenses, queuePendingExpense, subscribePendingExpenses } = await import("./sync");

const PAYLOAD: CreateExpenseInput = {
  payerId: "11111111-1111-1111-1111-111111111111",
  amount: "10.00",
  currencyCode: "EUR",
  description: "Cena",
  expenseDate: "2026-08-03",
  split: { method: "equal", participantUserIds: ["11111111-1111-1111-1111-111111111111"] },
};

function makePending(overrides: Partial<PendingExpense> = {}): PendingExpense {
  return {
    localId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    groupId: "grupo-1",
    payload: PAYLOAD,
    createdAt: Date.now(),
    status: "pending",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("navigator", { onLine: true });
});

function sentBodyOf(callIndex: number): { clientRequestId?: string } & Record<string, unknown> {
  const call = apiFetchMock.mock.calls[callIndex];
  if (!call) throw new Error(`apiFetch no se llamo en la posicion ${callIndex}`);
  const [, options] = call as [string, RequestInit];
  return JSON.parse(options.body as string);
}

describe("queuePendingExpense", () => {
  it("delega en addPendingExpense y notifica a los suscriptores", async () => {
    const pending = makePending();
    dbMock.addPendingExpense.mockResolvedValueOnce(pending);
    const listener = vi.fn();
    const unsubscribe = subscribePendingExpenses(listener);

    const result = await queuePendingExpense("grupo-1", PAYLOAD);

    expect(dbMock.addPendingExpense).toHaveBeenCalledWith({ groupId: "grupo-1", payload: PAYLOAD });
    expect(result).toBe(pending);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

describe("syncPendingExpenses — idempotencia (clientRequestId)", () => {
  it("reenvia el payload con clientRequestId = localId, para que el servidor pueda deduplicar reintentos", async () => {
    const pending = makePending();
    dbMock.listPendingExpenses.mockResolvedValueOnce([pending]);
    apiFetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    await syncPendingExpenses();

    expect(apiFetchMock).toHaveBeenCalledWith(
      `/api/groups/${pending.groupId}/expenses`,
      expect.objectContaining({ method: "POST" }),
    );
    const sentBody = sentBodyOf(0);
    expect(sentBody).toEqual({ ...PAYLOAD, clientRequestId: pending.localId });
  });

  it("un reintento tras un fallo de red vuelve a enviar exactamente el mismo clientRequestId", async () => {
    const pending = makePending();
    dbMock.listPendingExpenses.mockResolvedValueOnce([pending]);
    apiFetchMock.mockRejectedValueOnce(new Error("network down"));

    await syncPendingExpenses();
    const firstBody = sentBodyOf(0);

    dbMock.listPendingExpenses.mockResolvedValueOnce([pending]);
    apiFetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    await syncPendingExpenses();
    const secondBody = sentBodyOf(1);

    expect(firstBody.clientRequestId).toBe(pending.localId);
    expect(secondBody.clientRequestId).toBe(pending.localId);
    expect(firstBody.clientRequestId).toBe(secondBody.clientRequestId);
  });
});

describe("syncPendingExpenses — resultados y control de la cola", () => {
  it("no hace nada si el navegador esta offline", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const result = await syncPendingExpenses();
    expect(result).toEqual({ synced: 0, failed: 0 });
    expect(dbMock.listPendingExpenses).not.toHaveBeenCalled();
  });

  it("marca como sincronizado y elimina de la cola cuando el servidor responde ok", async () => {
    const pending = makePending();
    dbMock.listPendingExpenses.mockResolvedValueOnce([pending]);
    apiFetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    const result = await syncPendingExpenses();

    expect(result).toEqual({ synced: 1, failed: 0 });
    expect(dbMock.removePendingExpense).toHaveBeenCalledWith(pending.localId);
  });

  it("marca como error (sin eliminar) cuando el servidor rechaza el gasto, y continua con el resto de la cola", async () => {
    const rejected = makePending({ localId: "rechazado" });
    const accepted = makePending({ localId: "aceptado" });
    dbMock.listPendingExpenses.mockResolvedValueOnce([rejected, accepted]);
    apiFetchMock
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Datos invalidos" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    const result = await syncPendingExpenses();

    expect(result).toEqual({ synced: 1, failed: 1 });
    expect(dbMock.updatePendingExpense).toHaveBeenCalledWith("rechazado", {
      status: "error",
      errorMessage: "Datos invalidos",
    });
    expect(dbMock.removePendingExpense).toHaveBeenCalledWith("aceptado");
  });

  it("se detiene en el primer fallo de red sin marcar error (probablemente seguimos offline)", async () => {
    const first = makePending({ localId: "primero" });
    const second = makePending({ localId: "segundo" });
    dbMock.listPendingExpenses.mockResolvedValueOnce([first, second]);
    apiFetchMock.mockRejectedValueOnce(new Error("network down"));

    const result = await syncPendingExpenses();

    expect(result).toEqual({ synced: 0, failed: 0 });
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(dbMock.updatePendingExpense).toHaveBeenCalledWith("primero", { status: "pending" });
  });

  it("omite los elementos que ya estan sincronizandose", async () => {
    const syncing = makePending({ localId: "en-curso", status: "syncing" });
    dbMock.listPendingExpenses.mockResolvedValueOnce([syncing]);

    const result = await syncPendingExpenses();

    expect(result).toEqual({ synced: 0, failed: 0 });
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});
