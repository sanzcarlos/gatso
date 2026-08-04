import { describe, expect, it } from "vitest";
import {
  extractSplitwiseShares,
  chooseSplitForSingleExpense,
  decomposeMultiPayerExpense,
  sharesToFixedSplit,
  type PayerShare,
  type ParticipantShare,
} from "./mapping";
import type { SplitwiseExpense } from "./client";

function makeExpense(users: { user_id: number; paid_share: string; owed_share: string }[]): SplitwiseExpense {
  return {
    id: 1,
    group_id: 10,
    description: "test",
    details: null,
    cost: "0",
    currency_code: "EUR",
    date: "2024-01-01T00:00:00Z",
    payment: false,
    deleted_at: null,
    created_by: null,
    users,
  };
}

describe("extractSplitwiseShares", () => {
  it("separa pagadores y participantes, ignorando importes en cero", () => {
    const expense = makeExpense([
      { user_id: 1, paid_share: "30.00", owed_share: "10.00" },
      { user_id: 2, paid_share: "0.00", owed_share: "10.00" },
      { user_id: 3, paid_share: "0.00", owed_share: "10.00" },
    ]);
    const { payers, participants } = extractSplitwiseShares(expense);
    expect(payers).toEqual([{ userId: "1", cents: 3000 }]);
    expect(participants).toEqual([
      { userId: "1", cents: 1000 },
      { userId: "2", cents: 1000 },
      { userId: "3", cents: 1000 },
    ]);
  });
});

describe("chooseSplitForSingleExpense", () => {
  it("detecta reparto equal exacto", () => {
    const participants: ParticipantShare[] = [
      { userId: "a", cents: 1000 },
      { userId: "b", cents: 1000 },
      { userId: "c", cents: 1000 },
    ];
    const split = chooseSplitForSingleExpense(3000, participants);
    expect(split).toEqual({ method: "equal", participantUserIds: ["a", "b", "c"] });
  });

  it("detecta reparto equal con resto de centimos (asignado a las primeras posiciones, igual que distributeEqually)", () => {
    const participants: ParticipantShare[] = [
      { userId: "a", cents: 34 },
      { userId: "b", cents: 33 },
      { userId: "c", cents: 33 },
    ];
    const split = chooseSplitForSingleExpense(100, participants);
    expect(split).toEqual({ method: "equal", participantUserIds: ["a", "b", "c"] });
  });

  it("detecta reparto por porcentajes exactos", () => {
    const participants: ParticipantShare[] = [
      { userId: "a", cents: 7500 },
      { userId: "b", cents: 2500 },
    ];
    const split = chooseSplitForSingleExpense(10000, participants);
    expect(split.method).toBe("percentage");
    if (split.method === "percentage") {
      expect(split.shares).toEqual([
        { userId: "a", percentage: "75.00" },
        { userId: "b", percentage: "25.00" },
      ]);
    }
  });

  it("recurre a fixed cuando no encaja ni en equal ni en percentage exacto", () => {
    const participants: ParticipantShare[] = [
      { userId: "a", cents: 1 },
      { userId: "b", cents: 1 },
      { userId: "c", cents: 2998 },
    ];
    const split = chooseSplitForSingleExpense(3000, participants);
    expect(split.method).toBe("fixed");
    if (split.method === "fixed") {
      expect(split.shares).toEqual([
        { userId: "a", amount: "0.01" },
        { userId: "b", amount: "0.01" },
        { userId: "c", amount: "29.98" },
      ]);
    }
  });
});

describe("decomposeMultiPayerExpense", () => {
  it("lanza si los importes pagados y repartidos no coinciden", () => {
    const payers: PayerShare[] = [{ userId: "a", cents: 1000 }];
    const participants: ParticipantShare[] = [{ userId: "a", cents: 900 }];
    expect(() => decomposeMultiPayerExpense(payers, participants)).toThrow(/no esta equilibrado/);
  });

  it("cada sub-expense suma exactamente su importe pagado", () => {
    const payers: PayerShare[] = [
      { userId: "a", cents: 6000 },
      { userId: "b", cents: 4000 },
    ];
    const participants: ParticipantShare[] = [
      { userId: "a", cents: 3333 },
      { userId: "b", cents: 3333 },
      { userId: "c", cents: 3334 },
    ];
    const result = decomposeMultiPayerExpense(payers, participants);
    expect(result).toHaveLength(2);
    for (const subExpense of result) {
      const sum = subExpense.shares.reduce((s, share) => s + share.cents, 0);
      expect(sum).toBe(subExpense.amountCents);
    }
  });

  it("la suma de shares de cada usuario a traves de todas las sub-expenses reproduce su owed_share original exacto", () => {
    const payers: PayerShare[] = [
      { userId: "a", cents: 6000 },
      { userId: "b", cents: 4000 },
    ];
    const participants: ParticipantShare[] = [
      { userId: "a", cents: 3333 },
      { userId: "b", cents: 3333 },
      { userId: "c", cents: 3334 },
    ];
    const result = decomposeMultiPayerExpense(payers, participants);
    const totalsByUser = new Map<string, number>();
    for (const subExpense of result) {
      for (const share of subExpense.shares) {
        totalsByUser.set(share.userId, (totalsByUser.get(share.userId) ?? 0) + share.cents);
      }
    }
    expect(totalsByUser.get("a")).toBe(3333);
    expect(totalsByUser.get("b")).toBe(3333);
    expect(totalsByUser.get("c")).toBe(3334);
  });

  it("preserva los invariantes con importes y numero de participantes que no dividen exactamente (peor caso de redondeo)", () => {
    const payers: PayerShare[] = [
      { userId: "p1", cents: 101 },
      { userId: "p2", cents: 103 },
      { userId: "p3", cents: 107 },
    ];
    const participants: ParticipantShare[] = [
      { userId: "u1", cents: 77 },
      { userId: "u2", cents: 79 },
      { userId: "u3", cents: 83 },
      { userId: "u4", cents: 72 },
    ];
    const result = decomposeMultiPayerExpense(payers, participants);

    for (const subExpense of result) {
      const sum = subExpense.shares.reduce((s, share) => s + share.cents, 0);
      expect(sum).toBe(subExpense.amountCents);
    }

    const totalsByUser = new Map<string, number>();
    for (const subExpense of result) {
      for (const share of subExpense.shares) {
        totalsByUser.set(share.userId, (totalsByUser.get(share.userId) ?? 0) + share.cents);
      }
    }
    for (const participant of participants) {
      expect(totalsByUser.get(participant.userId) ?? 0).toBe(participant.cents);
    }
  });

  it("sharesToFixedSplit produce un SplitInput fixed valido", () => {
    const split = sharesToFixedSplit([
      { userId: "a", cents: 500 },
      { userId: "b", cents: 500 },
    ]);
    expect(split).toEqual({
      method: "fixed",
      shares: [
        { userId: "a", amount: "5.00" },
        { userId: "b", amount: "5.00" },
      ],
    });
  });
});
