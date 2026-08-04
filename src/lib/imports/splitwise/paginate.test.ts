import { describe, expect, it, vi } from "vitest";
import { fetchAllSplitwiseExpenses } from "./paginate";
import type { SplitwiseClient, SplitwiseExpense } from "./client";

function makeExpense(id: number): SplitwiseExpense {
  return {
    id,
    group_id: 1,
    description: `expense-${id}`,
    details: null,
    cost: "10.00",
    currency_code: "EUR",
    date: "2024-01-01T00:00:00Z",
    payment: false,
    deleted_at: null,
    created_by: null,
    users: [],
  };
}

function fakeClient(pages: SplitwiseExpense[][]): SplitwiseClient {
  let call = 0;
  return {
    getExpenses: vi.fn(async () => ({ expenses: pages[call++] ?? [] })),
  } as unknown as SplitwiseClient;
}

describe("fetchAllSplitwiseExpenses", () => {
  it("se detiene cuando una pagina llega incompleta", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => makeExpense(i));
    const page2 = Array.from({ length: 30 }, (_, i) => makeExpense(100 + i));
    const client = fakeClient([page1, page2]);

    const result = await fetchAllSplitwiseExpenses(client, "1");
    expect(result.expenses).toHaveLength(130);
    expect(result.truncated).toBe(false);
    expect(client.getExpenses).toHaveBeenCalledTimes(2);
  });

  it("funciona con una unica pagina incompleta", async () => {
    const page1 = [makeExpense(1), makeExpense(2)];
    const client = fakeClient([page1]);

    const result = await fetchAllSplitwiseExpenses(client, "1");
    expect(result.expenses).toHaveLength(2);
    expect(result.truncated).toBe(false);
  });
});
