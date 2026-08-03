import { describe, it, expect } from "vitest";
import { minimizeTransactions, minimizeExact, minimizeGreedy, EXACT_THRESHOLD } from "./optimize";
import { AppError } from "@/lib/errors";
import type { Balance, Transaction } from "./optimize";

const A = "aaaaaaaa-0000-0000-0000-000000000000";
const B = "bbbbbbbb-0000-0000-0000-000000000000";
const C = "cccccccc-0000-0000-0000-000000000000";

/** Aplica las transacciones a los balances y comprueba que todos quedan a cero. */
function assertSettles(balances: Balance[], transactions: Transaction[]) {
  const byUser = new Map(balances.map((b) => [b.userId, b.netCents]));
  for (const t of transactions) {
    // Quien paga (deudor, balance negativo) se acerca a cero al pagar;
    // quien cobra (acreedor, balance positivo) se acerca a cero al recibir.
    byUser.set(t.fromUserId, (byUser.get(t.fromUserId) ?? 0) + t.amountCents);
    byUser.set(t.toUserId, (byUser.get(t.toUserId) ?? 0) - t.amountCents);
    expect(t.amountCents).toBeGreaterThan(0);
  }
  for (const netCents of byUser.values()) {
    expect(netCents).toBe(0);
  }
}

describe("minimizeTransactions", () => {
  it("no genera transacciones si todos los balances estan a cero", () => {
    expect(minimizeTransactions([{ userId: A, netCents: 0 }])).toEqual([]);
  });

  it("no genera transacciones si un ciclo ya se compensa exactamente (pago == reparto)", () => {
    const balances: Balance[] = [
      { userId: A, netCents: 0 },
      { userId: B, netCents: 0 },
      { userId: C, netCents: 0 },
    ];
    expect(minimizeTransactions(balances)).toEqual([]);
  });

  it("un deudor y un acreedor: una sola transaccion", () => {
    const balances: Balance[] = [
      { userId: A, netCents: -500 },
      { userId: B, netCents: 500 },
    ];
    const transactions = minimizeTransactions(balances);
    expect(transactions).toEqual([{ fromUserId: A, toUserId: B, amountCents: 500 }]);
    assertSettles(balances, transactions);
  });

  it("caso de ejemplo conocido (LeetCode 465, caso 1): 3 personas, 1 transaccion optima", () => {
    // Historial de pagos: 0 paga a 1 (10), 1 paga a 0 (1), 1 paga a 2 (5), 2 paga a 0 (5).
    // Balance neto resultante: persona0 = -4, persona1 = +4, persona2 = 0.
    const balances: Balance[] = [
      { userId: "p0", netCents: -400 },
      { userId: "p1", netCents: 400 },
      { userId: "p2", netCents: 0 },
    ];
    const transactions = minimizeTransactions(balances);
    expect(transactions).toHaveLength(1);
    expect(transactions).toEqual([{ fromUserId: "p0", toUserId: "p1", amountCents: 400 }]);
    assertSettles(balances, transactions);
  });

  it("caso de ejemplo conocido (LeetCode 465, caso 2): 2 deudores, 1 acreedor, minimo 2 transacciones", () => {
    const balances: Balance[] = [
      { userId: "p0", netCents: -500 },
      { userId: "p1", netCents: 1000 },
      { userId: "p2", netCents: -500 },
    ];
    const transactions = minimizeTransactions(balances);
    expect(transactions).toHaveLength(2);
    assertSettles(balances, transactions);
  });

  it("rechaza balances que no suman cero (error de calculo previo)", () => {
    expect(() => minimizeTransactions([{ userId: A, netCents: 100 }])).toThrow(AppError);
  });

  it("usa el algoritmo exacto por debajo del umbral y nunca genera peor resultado que el voraz", () => {
    const balances: Balance[] = [
      { userId: "a", netCents: -300 },
      { userId: "b", netCents: -300 },
      { userId: "c", netCents: 200 },
      { userId: "d", netCents: 200 },
      { userId: "e", netCents: 200 },
    ];
    expect(balances.length).toBeLessThanOrEqual(EXACT_THRESHOLD);
    const exact = minimizeExact(balances);
    const greedy = minimizeGreedy(balances);
    assertSettles(balances, exact);
    assertSettles(balances, greedy);
    expect(exact.length).toBeLessThanOrEqual(greedy.length);
  });

  it("la heuristica voraz nunca genera mas de n-1 transacciones", () => {
    const balances: Balance[] = [
      { userId: "a", netCents: -700 },
      { userId: "b", netCents: -200 },
      { userId: "c", netCents: -100 },
      { userId: "d", netCents: 500 },
      { userId: "e", netCents: 500 },
    ];
    const transactions = minimizeGreedy(balances);
    assertSettles(balances, transactions);
    expect(transactions.length).toBeLessThanOrEqual(balances.length - 1);
  });
});
