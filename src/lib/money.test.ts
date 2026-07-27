import { describe, it, expect } from "vitest";
import {
  parseAmountToCents,
  centsToAmount,
  distributeEqually,
  distributeByBasisPoints,
  assertExactSum,
  parsePercentageToBasisPoints,
} from "./money";
import { AppError } from "@/lib/errors";

describe("parseAmountToCents / centsToAmount", () => {
  it("convierte importes decimales a centimos y viceversa", () => {
    expect(parseAmountToCents("12.50")).toBe(1250);
    expect(parseAmountToCents("12.5")).toBe(1250);
    expect(parseAmountToCents("12")).toBe(1200);
    expect(parseAmountToCents("0.01")).toBe(1);
    expect(centsToAmount(1250)).toBe("12.50");
    expect(centsToAmount(1)).toBe("0.01");
  });

  it("rechaza formatos invalidos", () => {
    expect(() => parseAmountToCents("abc")).toThrow(AppError);
    expect(() => parseAmountToCents("12.555")).toThrow(AppError);
  });
});

describe("distributeEqually", () => {
  it("reparte sin perder centimos cuando no divide exacto", () => {
    const shares = distributeEqually(1000, 3);
    expect(shares).toEqual([334, 333, 333]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it("reparte exacto cuando divide perfecto", () => {
    expect(distributeEqually(900, 3)).toEqual([300, 300, 300]);
  });

  it("lanza error sin participantes", () => {
    expect(() => distributeEqually(1000, 0)).toThrow(AppError);
  });
});

describe("distributeByBasisPoints", () => {
  it("reparte por porcentajes sin perder centimos (33/33/34)", () => {
    const basisPoints = [3333, 3333, 3334];
    const shares = distributeByBasisPoints(1000, basisPoints);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it("rechaza si los porcentajes no suman 100%", () => {
    expect(() => distributeByBasisPoints(1000, [5000, 4000])).toThrow(AppError);
  });

  it("reparte proporcionalmente respetando pesos distintos", () => {
    const shares = distributeByBasisPoints(10000, [7000, 3000]);
    expect(shares).toEqual([7000, 3000]);
  });
});

describe("assertExactSum", () => {
  it("no lanza si la suma coincide", () => {
    expect(() => assertExactSum([500, 500], 1000)).not.toThrow();
  });

  it("lanza si la suma no coincide", () => {
    expect(() => assertExactSum([400, 500], 1000)).toThrow(AppError);
  });
});

describe("parsePercentageToBasisPoints", () => {
  it("convierte porcentajes a puntos base", () => {
    expect(parsePercentageToBasisPoints("33.33")).toBe(3333);
    expect(parsePercentageToBasisPoints("100")).toBe(10000);
  });

  it("rechaza porcentajes fuera de rango", () => {
    expect(() => parsePercentageToBasisPoints("150")).toThrow(AppError);
  });
});
