import { describe, expect, it } from "vitest";
import { classifySplitwiseExpense, determineFinalJobStatus } from "./job-status";

describe("classifySplitwiseExpense", () => {
  it("clasifica un gasto borrado, aunque tambien sea un pago", () => {
    expect(classifySplitwiseExpense({ deleted_at: "2024-01-01T00:00:00Z", payment: true })).toBe("deleted");
  });

  it("clasifica un pago/liquidacion", () => {
    expect(classifySplitwiseExpense({ deleted_at: null, payment: true })).toBe("settlement_payment");
  });

  it("clasifica un gasto normal", () => {
    expect(classifySplitwiseExpense({ deleted_at: null, payment: false })).toBe("expense");
  });
});

describe("determineFinalJobStatus", () => {
  it("completed si no hubo ningun fallo", () => {
    expect(determineFinalJobStatus({ importedCount: 5, skippedCount: 2, failedCount: 0 })).toBe("completed");
  });

  it("completed incluso si no se importo ni omitio nada (grupo vacio)", () => {
    expect(determineFinalJobStatus({ importedCount: 0, skippedCount: 0, failedCount: 0 })).toBe("completed");
  });

  it("partial si hubo fallos pero tambien exito", () => {
    expect(determineFinalJobStatus({ importedCount: 3, skippedCount: 0, failedCount: 1 })).toBe("partial");
  });

  it("partial si hubo fallos pero tambien omisiones", () => {
    expect(determineFinalJobStatus({ importedCount: 0, skippedCount: 1, failedCount: 1 })).toBe("partial");
  });

  it("failed si hubo fallos y nada de exito ni omisiones", () => {
    expect(determineFinalJobStatus({ importedCount: 0, skippedCount: 0, failedCount: 1 })).toBe("failed");
  });
});
