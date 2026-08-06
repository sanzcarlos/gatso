import { describe, expect, it } from "vitest";
import { settlementPaymentAppliesToScope } from "./scope";

describe("settlementPaymentAppliesToScope", () => {
  it("incluye en el grupo los pagos globales y los realizados en subgrupos", () => {
    expect(settlementPaymentAppliesToScope(undefined, null)).toBe(true);
    expect(settlementPaymentAppliesToScope(undefined, "subgroup-1")).toBe(true);
  });

  it("solo incluye en un subgrupo sus propios pagos", () => {
    expect(settlementPaymentAppliesToScope("subgroup-1", "subgroup-1")).toBe(true);
    expect(settlementPaymentAppliesToScope("subgroup-1", "subgroup-2")).toBe(false);
    expect(settlementPaymentAppliesToScope("subgroup-1", null)).toBe(false);
  });
});

