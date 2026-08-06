import { describe, expect, it } from "vitest";
import { settlementPaymentAppliesToScope } from "./scope";

describe("settlementPaymentAppliesToScope", () => {
  it("en un grupo con subgrupos solo agrega los pagos de sus subgrupos", () => {
    expect(settlementPaymentAppliesToScope(undefined, null, true)).toBe(false);
    expect(settlementPaymentAppliesToScope(undefined, "subgroup-1", true)).toBe(true);
  });

  it("en un grupo sin subgrupos solo aplica pagos globales", () => {
    expect(settlementPaymentAppliesToScope(undefined, null, false)).toBe(true);
    expect(settlementPaymentAppliesToScope(undefined, "subgroup-1", false)).toBe(false);
  });

  it("solo incluye en un subgrupo sus propios pagos", () => {
    expect(settlementPaymentAppliesToScope("subgroup-1", "subgroup-1", true)).toBe(true);
    expect(settlementPaymentAppliesToScope("subgroup-1", "subgroup-2", true)).toBe(false);
    expect(settlementPaymentAppliesToScope("subgroup-1", null, true)).toBe(false);
  });
});
