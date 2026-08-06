import { describe, expect, it, vi } from "vitest";
import type { db as database } from "@/db";

vi.mock("@/db", async () => {
  const { expenses } = await import("@/db/schema/expenses");
  const { externalEntityMappings } = await import("@/db/schema/external-entity-mappings");
  const { settlementPayments } = await import("@/db/schema/settlement-payments");
  return { db: {}, expenses, externalEntityMappings, settlementPayments };
});

import { getLiveFinancialEntityMapping } from "./mapping-store";

function fakeClient(selectResults: unknown[][]) {
  const limit = vi.fn(() => Promise.resolve(selectResults.shift() ?? []));
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  const deleteWhere = vi.fn(() => Promise.resolve());
  const deleteFrom = vi.fn(() => ({ where: deleteWhere }));

  return {
    client: { select, delete: deleteFrom } as unknown as typeof database,
    deleteFrom,
    deleteWhere,
  };
}

describe("getLiveFinancialEntityMapping", () => {
  const mapping = {
    id: "mapping-1",
    provider: "splitwise",
    entityType: "expense",
    externalId: "expense-1",
    gatsoId: "gatso-expense-1",
    externalVersion: null,
    createdByJobId: null,
    createdAt: new Date(),
  };

  it("conserva y devuelve el mapping si la entidad Gatso existe", async () => {
    const fake = fakeClient([[mapping], [{ id: mapping.gatsoId }]]);

    await expect(getLiveFinancialEntityMapping("expense", mapping.externalId, fake.client)).resolves.toEqual(mapping);
    expect(fake.deleteFrom).not.toHaveBeenCalled();
  });

  it("elimina y descarta un mapping huerfano para permitir reimportar", async () => {
    const fake = fakeClient([[mapping], []]);

    await expect(getLiveFinancialEntityMapping("expense", mapping.externalId, fake.client)).resolves.toBeNull();
    expect(fake.deleteFrom).toHaveBeenCalledOnce();
    expect(fake.deleteWhere).toHaveBeenCalledOnce();
  });
});
