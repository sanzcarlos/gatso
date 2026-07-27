import { AppError } from "@/lib/errors";

/**
 * Utilidades de dinero basadas en centimos enteros (bigint-safe con
 * `number`, ya que los importes de gastos compartidos nunca acercan el
 * limite de MAX_SAFE_INTEGER). Se evita deliberadamente la aritmetica en
 * coma flotante para las sumas/repartos: 0.1 + 0.2 !== 0.3 en JS, y un
 * reparto de gastos con errores de redondeo es un bug de integridad de
 * datos, no un detalle cosmetico.
 */

const AMOUNT_PATTERN = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

/** Convierte un string decimal ("12.5", "12", "-3.40") a centimos enteros. */
export function parseAmountToCents(amount: string): number {
  const match = AMOUNT_PATTERN.exec(amount.trim());
  if (!match) {
    throw new AppError(400, `Importe invalido: "${amount}"`, "invalid_amount");
  }
  const [, sign, intPart, decPart = ""] = match;
  const cents = Number(intPart) * 100 + Number(decPart.padEnd(2, "0"));
  return sign === "-" ? -cents : cents;
}

/** Convierte centimos enteros a un string decimal apto para columnas `numeric`. */
export function centsToAmount(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(cents));
  const intPart = Math.floor(abs / 100);
  const decPart = (abs % 100).toString().padStart(2, "0");
  return `${sign}${intPart}.${decPart}`;
}

const PERCENTAGE_PATTERN = /^(\d{1,3})(?:\.(\d{1,2}))?$/;

/** Convierte un porcentaje decimal ("33.33") a puntos base enteros (33.33% -> 3333, sobre 10000 = 100%). */
export function parsePercentageToBasisPoints(percentage: string): number {
  const match = PERCENTAGE_PATTERN.exec(percentage.trim());
  if (!match) {
    throw new AppError(400, `Porcentaje invalido: "${percentage}"`, "invalid_percentage");
  }
  const [, intPart, decPart = ""] = match;
  const basisPoints = Number(intPart) * 100 + Number(decPart.padEnd(2, "0"));
  if (basisPoints < 0 || basisPoints > 10000) {
    throw new AppError(400, `Porcentaje fuera de rango: "${percentage}"`, "percentage_out_of_range");
  }
  return basisPoints;
}

/**
 * Reparte `totalCents` en `count` partes enteras que suman exactamente
 * `totalCents`, asignando los centimos sobrantes (el "problema del
 * centimo") a las primeras posiciones.
 */
export function distributeEqually(totalCents: number, count: number): number[] {
  if (count <= 0) {
    throw new AppError(400, "Se necesita al menos un participante", "no_participants");
  }
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

/**
 * Reparte `totalCents` segun una lista de puntos base (deben sumar 10000
 * = 100%) usando el metodo del resto mayor (Hamilton) para que la suma de
 * las partes enteras resultantes sea exactamente `totalCents`, sin perder
 * ni anadir centimos por redondeo.
 */
export function distributeByBasisPoints(totalCents: number, basisPoints: number[]): number[] {
  const totalBasisPoints = basisPoints.reduce((sum, bp) => sum + bp, 0);
  if (totalBasisPoints !== 10000) {
    throw new AppError(
      400,
      `Los porcentajes deben sumar 100% (suman ${(totalBasisPoints / 100).toFixed(2)}%)`,
      "percentages_must_sum_to_100",
    );
  }

  const rawShares = basisPoints.map((bp) => (totalCents * bp) / 10000);
  const flooredShares = rawShares.map((share) => Math.floor(share));
  const allocated = flooredShares.reduce((sum, share) => sum + share, 0);
  const remainder = totalCents - allocated;

  const order = rawShares
    .map((share, index) => ({ index, fraction: share - Math.floor(share) }))
    .sort((a, b) => b.fraction - a.fraction);

  const result = [...flooredShares];
  for (let i = 0; i < remainder; i++) {
    const entry = order[i % order.length];
    if (entry) result[entry.index] = (result[entry.index] ?? 0) + 1;
  }
  return result;
}

/** Valida que una lista de importes fijos (en centimos) sume exactamente el total. */
export function assertExactSum(cents: number[], expectedTotalCents: number): void {
  const sum = cents.reduce((acc, value) => acc + value, 0);
  if (sum !== expectedTotalCents) {
    throw new AppError(
      400,
      `La suma de los importes (${centsToAmount(sum)}) no coincide con el total del gasto (${centsToAmount(expectedTotalCents)})`,
      "shares_do_not_match_total",
    );
  }
}
