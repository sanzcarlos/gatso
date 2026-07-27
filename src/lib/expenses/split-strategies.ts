import { AppError } from "@/lib/errors";
import {
  parseAmountToCents,
  parsePercentageToBasisPoints,
  distributeEqually,
  distributeByBasisPoints,
  assertExactSum,
} from "@/lib/money";
import type { SplitInput } from "@/lib/validation/expenses";

export interface ComputedShare {
  userId: string;
  shareAmountCents: number;
  sharePercentageBasisPoints: number | null;
}

/**
 * Patron Strategy: cada metodo de reparto implementa la misma interfaz
 * (recibe el total en centimos + los datos crudos del metodo, devuelve
 * las partes por usuario en centimos). Anadir un metodo nuevo (ej.
 * "por partes/shares", "por consumo") solo requiere registrar una nueva
 * funcion aqui; no toca el modelo de datos (`expenses`/`expense_shares`
 * ya son agnosticos al metodo) ni el resto del servicio.
 */
type SplitStrategy = (totalCents: number, split: SplitInput) => ComputedShare[];

const equalStrategy: SplitStrategy = (totalCents, split) => {
  if (split.method !== "equal") throw new Error("equalStrategy invocada con split incorrecto");
  const shares = distributeEqually(totalCents, split.participantUserIds.length);
  return split.participantUserIds.map((userId, index) => ({
    userId,
    shareAmountCents: shares[index] ?? 0,
    sharePercentageBasisPoints: null,
  }));
};

const percentageStrategy: SplitStrategy = (totalCents, split) => {
  if (split.method !== "percentage") throw new Error("percentageStrategy invocada con split incorrecto");
  const basisPoints = split.shares.map((share) => parsePercentageToBasisPoints(share.percentage));
  const shares = distributeByBasisPoints(totalCents, basisPoints);
  return split.shares.map((share, index) => ({
    userId: share.userId,
    shareAmountCents: shares[index] ?? 0,
    sharePercentageBasisPoints: basisPoints[index] ?? 0,
  }));
};

const fixedStrategy: SplitStrategy = (totalCents, split) => {
  if (split.method !== "fixed") throw new Error("fixedStrategy invocada con split incorrecto");
  const amounts = split.shares.map((share) => parseAmountToCents(share.amount));
  assertExactSum(amounts, totalCents);
  return split.shares.map((share, index) => ({
    userId: share.userId,
    shareAmountCents: amounts[index] ?? 0,
    sharePercentageBasisPoints: null,
  }));
};

const strategies: Record<SplitInput["method"], SplitStrategy> = {
  equal: equalStrategy,
  percentage: percentageStrategy,
  fixed: fixedStrategy,
};

/** Calcula los repartos por usuario para un gasto segun su metodo de split. */
export function computeShares(totalCents: number, split: SplitInput): ComputedShare[] {
  const strategy = strategies[split.method];
  if (!strategy) {
    throw new AppError(400, `Metodo de reparto no soportado: "${split.method}"`, "unsupported_split_method");
  }
  const shares = strategy(totalCents, split);

  const userIds = shares.map((share) => share.userId);
  if (new Set(userIds).size !== userIds.length) {
    throw new AppError(400, "Un mismo usuario no puede aparecer dos veces en el reparto", "duplicate_participant");
  }

  return shares;
}
