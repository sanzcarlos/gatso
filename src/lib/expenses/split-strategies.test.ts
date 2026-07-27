import { describe, it, expect } from "vitest";
import { computeShares } from "./split-strategies";
import { AppError } from "@/lib/errors";
import type { SplitInput } from "@/lib/validation/expenses";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const USER_C = "33333333-3333-3333-3333-333333333333";

describe("computeShares", () => {
  it("reparte en partes iguales sin perder centimos", () => {
    const split: SplitInput = { method: "equal", participantUserIds: [USER_A, USER_B, USER_C] };
    const shares = computeShares(1000, split);
    const total = shares.reduce((sum, s) => sum + s.shareAmountCents, 0);
    expect(total).toBe(1000);
    expect(shares).toHaveLength(3);
  });

  it("reparte por porcentajes y la suma coincide con el total", () => {
    const split: SplitInput = {
      method: "percentage",
      shares: [
        { userId: USER_A, percentage: "50" },
        { userId: USER_B, percentage: "50" },
      ],
    };
    const shares = computeShares(2000, split);
    expect(shares.map((s) => s.shareAmountCents)).toEqual([1000, 1000]);
  });

  it("rechaza porcentajes que no suman 100%", () => {
    const split: SplitInput = {
      method: "percentage",
      shares: [
        { userId: USER_A, percentage: "50" },
        { userId: USER_B, percentage: "40" },
      ],
    };
    expect(() => computeShares(2000, split)).toThrow(AppError);
  });

  it("reparte por importes fijos que suman exactamente el total", () => {
    const split: SplitInput = {
      method: "fixed",
      shares: [
        { userId: USER_A, amount: "7.50" },
        { userId: USER_B, amount: "2.50" },
      ],
    };
    const shares = computeShares(1000, split);
    expect(shares.map((s) => s.shareAmountCents)).toEqual([750, 250]);
  });

  it("rechaza importes fijos que no suman el total del gasto", () => {
    const split: SplitInput = {
      method: "fixed",
      shares: [
        { userId: USER_A, amount: "5.00" },
        { userId: USER_B, amount: "4.00" },
      ],
    };
    expect(() => computeShares(1000, split)).toThrow(AppError);
  });

  it("rechaza participantes duplicados en el reparto", () => {
    const split: SplitInput = { method: "equal", participantUserIds: [USER_A, USER_A] };
    expect(() => computeShares(1000, split)).toThrow(AppError);
  });
});
