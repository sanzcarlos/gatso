import { AppError } from "@/lib/errors";
import { parseAmountToCents, centsToAmount, distributeEqually, distributeProportionally, assertExactSum } from "@/lib/money";
import type { SplitInput } from "@/lib/validation/expenses";
import type { SplitwiseExpense } from "./client";

/**
 * Mapeo financiero Splitwise -> Gatso (Fase 11). Todo el trabajo se hace
 * en centimos enteros (`src/lib/money.ts`), nunca en coma flotante, con
 * el mismo criterio anti-redondeo que el resto del proyecto.
 */

export interface PayerShare {
  userId: string;
  cents: number;
}

export interface ParticipantShare {
  userId: string;
  cents: number;
}

/** Extrae de un gasto de Splitwise quien pago cuanto y quien debe cuanto, ya en centimos enteros. */
export function extractSplitwiseShares(expense: SplitwiseExpense): { payers: PayerShare[]; participants: ParticipantShare[] } {
  const payers: PayerShare[] = [];
  const participants: ParticipantShare[] = [];

  for (const share of expense.users) {
    const paidCents = parseAmountToCents(share.paid_share);
    const owedCents = parseAmountToCents(share.owed_share);
    if (paidCents > 0) payers.push({ userId: String(share.user_id), cents: paidCents });
    if (owedCents > 0) participants.push({ userId: String(share.user_id), cents: owedCents });
  }

  return { payers, participants };
}

/**
 * Decide el metodo de reparto de Gatso que reproduce EXACTAMENTE los
 * `owed_share` de Splitwise para un unico pagador (backlog: "Traducir a
 * equal, percentage o fixed cuando el reparto encaje exactamente. Los
 * casos restantes se guardaran como importes fijos por usuario para no
 * perder centimos"). El orden de comprobacion es de mas a menos
 * especifico: `equal` es un caso particular de `percentage`, que a su
 * vez es un caso particular de `fixed`.
 */
export function chooseSplitForSingleExpense(totalCents: number, participants: ParticipantShare[]): SplitInput {
  const participantUserIds = participants.map((p) => p.userId);
  const targetCents = participants.map((p) => p.cents);

  const equalShares = distributeEqually(totalCents, participants.length);
  if (equalShares.every((cents, index) => cents === targetCents[index])) {
    return { method: "equal", participantUserIds };
  }

  const basisPoints = targetCents.map((cents) => Math.round((cents / totalCents) * 10000));
  const basisPointsSum = basisPoints.reduce((sum, bp) => sum + bp, 0);
  if (basisPointsSum === 10000) {
    const reconstructed = distributeProportionally(totalCents, basisPoints);
    if (reconstructed.every((cents, index) => cents === targetCents[index])) {
      return {
        method: "percentage",
        shares: participants.map((p, index) => ({
          userId: p.userId,
          percentage: (basisPoints[index]! / 100).toFixed(2),
        })),
      };
    }
  }

  assertExactSum(targetCents, totalCents);
  return {
    method: "fixed",
    shares: participants.map((p) => ({ userId: p.userId, amount: centsToAmount(p.cents) })),
  };
}

export interface DecomposedSubExpense {
  payerId: string;
  amountCents: number;
  /** Suma exactamente `amountCents`; la suma de este campo entre TODAS las sub-expenses de una misma columna de usuario reproduce su `owed_share` total original. */
  shares: ParticipantShare[];
}

/**
 * Descompone un gasto Splitwise con VARIOS pagadores en un gasto Gatso
 * enlazado por pagador (backlog Fase 11: "Splitwise admite varios
 * pagadores por gasto y Gatso tiene actualmente un unico payerId [...]
 * descomponer el gasto en registros enlazados que conserven exactamente
 * los saldos"). Decision documentada: se opto por la descomposicion en
 * vez de ampliar el modelo de datos de Gatso a multiples pagadores por
 * gasto (la otra opcion que planteaba el backlog) porque anadir
 * multi-pagador tocaria el esquema, el patron Strategy de repartos, la
 * validacion, la UI de creacion/edicion y las estadisticas/liquidaciones
 * ya existentes (Fases 3/4/9) para un caso que en la practica es
 * minoritario incluso dentro de Splitwise; la descomposicion reutiliza
 * intacta toda esa infraestructura.
 *
 * Garantiza dos invariantes de forma EXACTA (no aproximada):
 * 1. Cada sub-expense `shares` suma exactamente su `amountCents` (Gatso
 *    exige esto en cualquier gasto, `assertExactSum`).
 * 2. La suma de los `shares` de un mismo `userId` a traves de TODAS las
 *    sub-expenses reproduce exactamente su `owed_share` total original.
 *
 * Algoritmo: reparto proporcional por fila (Hamilton,
 * `distributeProportionally`) seguido de una correccion de columnas que
 * desplaza centimos DENTRO de la misma fila (nunca cambia la suma de una
 * fila) hasta que cada columna coincide exactamente con su objetivo. Es
 * un problema de "redondeo controlado de tablas de doble entrada": la
 * correccion siempre termina porque la suma de los defectos de columna es
 * cero (la suma total esta garantizada por construccion) y cada
 * desplazamiento reduce estrictamente el defecto restante.
 */
export function decomposeMultiPayerExpense(
  payers: PayerShare[],
  participants: ParticipantShare[],
): DecomposedSubExpense[] {
  if (payers.length === 0) {
    throw new AppError(400, "El gasto de Splitwise no tiene ningun pagador con importe positivo", "splitwise_no_payer");
  }
  const totalFromPayers = payers.reduce((sum, p) => sum + p.cents, 0);
  const totalFromParticipants = participants.reduce((sum, p) => sum + p.cents, 0);
  if (totalFromPayers !== totalFromParticipants) {
    throw new AppError(
      400,
      `El gasto de Splitwise no esta equilibrado (pagado ${centsToAmount(totalFromPayers)}, repartido ${centsToAmount(totalFromParticipants)})`,
      "splitwise_unbalanced_expense",
    );
  }

  const userIds = participants.map((p) => p.userId);
  const targetByUser = participants.map((p) => p.cents);

  const matrix: number[][] = payers.map((payer) => distributeProportionally(payer.cents, targetByUser));

  const columnSums = userIds.map((_, columnIndex) => matrix.reduce((sum, row) => sum + (row[columnIndex] ?? 0), 0));
  const columnDeltas = targetByUser.map((target, columnIndex) => target - columnSums[columnIndex]!);

  for (let needIndex = 0; needIndex < columnDeltas.length; needIndex++) {
    while (columnDeltas[needIndex]! > 0) {
      const donorIndex = columnDeltas.findIndex((delta) => delta < 0);
      if (donorIndex === -1) break;
      const rowIndex = matrix.findIndex((row) => (row[donorIndex] ?? 0) > 0);
      if (rowIndex === -1) break;
      matrix[rowIndex]![donorIndex] = matrix[rowIndex]![donorIndex]! - 1;
      matrix[rowIndex]![needIndex] = (matrix[rowIndex]![needIndex] ?? 0) + 1;
      columnDeltas[donorIndex] = columnDeltas[donorIndex]! + 1;
      columnDeltas[needIndex] = columnDeltas[needIndex]! - 1;
    }
  }

  return payers.map((payer, rowIndex) => {
    const shares = userIds
      .map((userId, columnIndex) => ({ userId, cents: matrix[rowIndex]![columnIndex]! }))
      .filter((share) => share.cents !== 0);
    assertExactSum(shares.map((s) => s.cents), payer.cents);
    return { payerId: payer.userId, amountCents: payer.cents, shares };
  });
}

/** Construye el `SplitInput` de tipo `fixed` a partir de un desglose de shares ya en centimos (usado tras `decomposeMultiPayerExpense`). */
export function sharesToFixedSplit(shares: ParticipantShare[]): SplitInput {
  return {
    method: "fixed",
    shares: shares.map((s) => ({ userId: s.userId, amount: centsToAmount(s.cents) })),
  };
}
