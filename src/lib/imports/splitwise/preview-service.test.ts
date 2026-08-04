import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SplitwiseExpense, SplitwiseGroup } from "./client";

const getSplitwiseClientForUser = vi.fn();

vi.mock("./connection-service", () => ({
  getSplitwiseClientForUser: (...args: unknown[]) => getSplitwiseClientForUser(...args),
}));

function makeExpense(overrides: Partial<SplitwiseExpense> = {}): SplitwiseExpense {
  return {
    id: 1,
    group_id: 1,
    description: "cena",
    details: null,
    cost: "30.00",
    currency_code: "EUR",
    date: "2024-03-01T00:00:00Z",
    payment: false,
    deleted_at: null,
    created_by: null,
    users: [
      { user_id: 1, paid_share: "30.00", owed_share: "15.00" },
      { user_id: 2, paid_share: "0.00", owed_share: "15.00" },
    ],
    ...overrides,
  };
}

describe("buildSplitwisePreview", () => {
  beforeEach(() => {
    getSplitwiseClientForUser.mockReset();
  });

  it("agrega correctamente monedas, rango de fechas y datos no soportados", async () => {
    const group: SplitwiseGroup = {
      id: 1,
      name: "Piso",
      members: [
        { id: 1, first_name: "Ana", last_name: "Lopez" },
        { id: 2, first_name: "Luis", last_name: null },
      ],
    };
    const expenses = [
      makeExpense({ id: 1, date: "2024-01-01T00:00:00Z", currency_code: "EUR" }),
      makeExpense({ id: 2, date: "2024-06-01T00:00:00Z", currency_code: "USD" }),
      makeExpense({ id: 3, deleted_at: "2024-02-01T00:00:00Z" }),
      makeExpense({ id: 4, payment: true }),
      makeExpense({
        id: 5,
        receipt: { original: "https://example.com/receipt.png" },
        comments_count: 2,
        repeats: true,
      }),
      makeExpense({
        id: 6,
        users: [
          { user_id: 1, paid_share: "15.00", owed_share: "15.00" },
          { user_id: 2, paid_share: "15.00", owed_share: "15.00" },
        ],
      }),
    ];

    getSplitwiseClientForUser.mockResolvedValue({
      getGroup: vi.fn().mockResolvedValue({ group }),
      getExpenses: vi.fn().mockResolvedValue({ expenses }),
    });

    const { buildSplitwisePreview } = await import("./preview-service");
    const preview = await buildSplitwisePreview("user-1", "1");

    expect(preview.sourceGroupName).toBe("Piso");
    expect(preview.participants).toEqual([
      { externalId: "1", displayName: "Ana Lopez" },
      { externalId: "2", displayName: "Luis" },
    ]);
    expect(preview.deletedCount).toBe(1);
    expect(preview.paymentCount).toBe(1);
    expect(preview.expenseCount).toBe(4);
    expect(preview.dateRange).toEqual({ earliest: "2024-01-01T00:00:00Z", latest: "2024-06-01T00:00:00Z" });
    expect(preview.currencies).toEqual(
      expect.arrayContaining([
        { currencyCode: "EUR", expenseCount: 3 },
        { currencyCode: "USD", expenseCount: 1 },
      ]),
    );
    expect(preview.multiPayerExpenseCount).toBe(1);
    expect(preview.unsupportedDataCounts).toEqual({ withReceipts: 1, withComments: 1, recurring: 1 });
    expect(preview.truncated).toBe(false);
  });

  it("incluye participantes historicos con el nombre embebido en el gasto", async () => {
    const group: SplitwiseGroup = { id: 1, name: "Viaje", members: [] };
    const historical = makeExpense({
      users: [
        {
          user_id: 108845445,
          user: { id: 108845445, first_name: "Oliver", last_name: "Cipri" },
          paid_share: "10.00",
          owed_share: "10.00",
        },
      ],
    });
    getSplitwiseClientForUser.mockResolvedValue({
      getGroup: vi.fn().mockResolvedValue({ group }),
      getExpenses: vi.fn().mockResolvedValueOnce({ expenses: [historical] }),
    });

    const { buildSplitwisePreview } = await import("./preview-service");
    const preview = await buildSplitwisePreview("user-1", "1");
    expect(preview.participants).toEqual([{ externalId: "108845445", displayName: "Oliver Cipri" }]);
  });
});
