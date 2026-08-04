import { describe, expect, it } from "vitest";
import { buildSplitwiseNetBalances, translateBalanceKeys, diffBalances, balanceKey } from "./reconciliation";
import type { SplitwiseExpense } from "./client";

function makeExpense(overrides: Partial<SplitwiseExpense> = {}): SplitwiseExpense {
  return {
    id: 1,
    group_id: 1,
    description: "cena",
    details: null,
    cost: "20.00",
    currency_code: "EUR",
    date: "2024-01-01T00:00:00Z",
    payment: false,
    deleted_at: null,
    created_by: null,
    users: [
      { user_id: 1, paid_share: "20.00", owed_share: "10.00", net_balance: "10.00" },
      { user_id: 2, paid_share: "0.00", owed_share: "10.00", net_balance: "-10.00" },
    ],
    ...overrides,
  };
}

describe("buildSplitwiseNetBalances", () => {
  it("suma net_balance por usuario y moneda a traves de varios gastos", () => {
    const expenses = [
      makeExpense({ id: 1 }),
      makeExpense({
        id: 2,
        currency_code: "EUR",
        users: [
          { user_id: 1, paid_share: "0.00", owed_share: "5.00", net_balance: "-5.00" },
          { user_id: 2, paid_share: "10.00", owed_share: "5.00", net_balance: "5.00" },
        ],
      }),
    ];
    const balances = buildSplitwiseNetBalances(expenses);
    expect(balances.get(balanceKey("EUR", "1"))).toBe(500);
    expect(balances.get(balanceKey("EUR", "2"))).toBe(-500);
  });

  it("ignora gastos borrados", () => {
    const expenses = [makeExpense({ id: 1, deleted_at: "2024-02-01T00:00:00Z" })];
    const balances = buildSplitwiseNetBalances(expenses);
    expect(balances.size).toBe(0);
  });

  it("ignora shares sin net_balance", () => {
    const expenses = [
      makeExpense({
        users: [
          { user_id: 1, paid_share: "20.00", owed_share: "10.00" },
          { user_id: 2, paid_share: "0.00", owed_share: "10.00" },
        ],
      }),
    ];
    const balances = buildSplitwiseNetBalances(expenses);
    expect(balances.size).toBe(0);
  });
});

describe("translateBalanceKeys", () => {
  it("traduce ids externos a ids Gatso y descarta los no mapeados", () => {
    const balances = new Map([
      [balanceKey("EUR", "1"), 1000],
      [balanceKey("EUR", "2"), -1000],
      [balanceKey("EUR", "3"), 500],
    ]);
    const mapping = new Map([
      ["1", "gatso-a"],
      ["2", "gatso-b"],
    ]);
    const translated = translateBalanceKeys(balances, mapping);
    expect(translated.get(balanceKey("EUR", "gatso-a"))).toBe(1000);
    expect(translated.get(balanceKey("EUR", "gatso-b"))).toBe(-1000);
    expect(translated.has(balanceKey("EUR", "3"))).toBe(false);
    expect(translated.size).toBe(2);
  });
});

describe("diffBalances", () => {
  it("no reporta nada cuando los balances coinciden exactamente", () => {
    const splitwise = new Map([[balanceKey("EUR", "a"), 1000]]);
    const gatso = new Map([[balanceKey("EUR", "a"), 1000]]);
    expect(diffBalances(splitwise, gatso)).toEqual([]);
  });

  it("reporta una discrepancia cuando los importes difieren", () => {
    const splitwise = new Map([[balanceKey("EUR", "a"), 1000]]);
    const gatso = new Map([[balanceKey("EUR", "a"), 900]]);
    expect(diffBalances(splitwise, gatso)).toEqual([
      { currencyCode: "EUR", gatsoUserId: "a", splitwiseCents: 1000, gatsoCents: 900, diffCents: -100 },
    ]);
  });

  it("trata las claves ausentes en un lado como 0", () => {
    const splitwise = new Map([[balanceKey("EUR", "a"), 500]]);
    const gatso = new Map<string, number>();
    expect(diffBalances(splitwise, gatso)).toEqual([
      { currencyCode: "EUR", gatsoUserId: "a", splitwiseCents: 500, gatsoCents: 0, diffCents: -500 },
    ]);
  });
});
