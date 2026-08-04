export type SplitwiseExpenseClassification = "deleted" | "settlement_payment" | "expense";

/** Clasifica un gasto de Splitwise antes de decidir como tratarlo (Fase 11). Pura, sin efectos secundarios: facil de testear. */
export function classifySplitwiseExpense(expense: { deleted_at: string | null; payment: boolean }): SplitwiseExpenseClassification {
  if (expense.deleted_at) return "deleted";
  if (expense.payment) return "settlement_payment";
  return "expense";
}

export type ImportJobFinalStatus = "completed" | "partial" | "failed";

export interface ImportJobCounts {
  importedCount: number;
  skippedCount: number;
  failedCount: number;
}

/**
 * Estado final de un job de importacion en funcion de sus contadores
 * (Fase 11, "criterio de finalizacion"): "completed" si no hubo ningun
 * fallo, "failed" si hubo fallos y nada se importo ni se omitio con
 * exito, "partial" en cualquier otro caso (algo se importo/omitio pero
 * tambien hubo fallos).
 */
export function determineFinalJobStatus(counts: ImportJobCounts): ImportJobFinalStatus {
  if (counts.failedCount === 0) return "completed";
  if (counts.importedCount > 0 || counts.skippedCount > 0) return "partial";
  return "failed";
}
