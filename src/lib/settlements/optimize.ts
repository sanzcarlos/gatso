/**
 * Minimizacion del numero de transacciones para liquidar deudas dentro de
 * un grupo (Fase 9), a partir de balances netos por usuario (positivo =
 * le deben dinero / acreedor; negativo = debe dinero / deudor; siempre en
 * centimos enteros, mismo criterio anti-coma-flotante que `src/lib/money.ts`).
 *
 * El problema general ("Optimal Account Balancing") es NP-dificil: es
 * equivalente a particionar el conjunto de balances en el minimo numero de
 * subconjuntos que suman cero y luego resolver cada subconjunto por
 * separado, lo cual esta emparentado con el problema de la suma de
 * subconjuntos. Por eso se combinan dos estrategias, elegidas segun el
 * numero de balances distintos de cero:
 *
 * - Hasta `EXACT_THRESHOLD` balances: backtracking exacto con poda
 *   (`minimizeExact`), que garantiza el numero minimo de transacciones
 *   posible. La complejidad es factorial en el peor caso, pero en la
 *   practica los subgrupos de gastos compartidos casi siempre tienen pocos
 *   participantes con saldo pendiente (la mayoria de gastos se acaban
 *   compensando entre si).
 * - Por encima de ese umbral (grupos grandes, hasta 64 miembros): heuristica
 *   voraz (`minimizeGreedy`, empareja siempre al mayor acreedor con el mayor
 *   deudor), que no garantiza el minimo absoluto pero si un resultado
 *   razonable en tiempo O(n^2 log n) y como mucho `n - 1` transacciones.
 */
import { AppError } from "@/lib/errors";

export interface Balance {
  userId: string;
  /** Positivo = acreedor (le deben), negativo = deudor (debe), en centimos. */
  netCents: number;
}

export interface Transaction {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
}

export const EXACT_THRESHOLD = 8;

/**
 * Backtracking exacto (variante del problema "Optimal Account Balancing"):
 * en cada paso se fija el primer balance no liquidado (`start`) y se prueba
 * a saldarlo por completo contra cada otro balance de signo opuesto,
 * generando una transaccion y recursando sobre el resto. Poda cualquier
 * rama que ya iguale o supere el mejor numero de transacciones encontrado.
 */
export function minimizeExact(balances: Balance[]): Transaction[] {
  const amounts = balances.map((b) => b.netCents);
  const ids = balances.map((b) => b.userId);
  let best: { count: number; transactions: Transaction[] } = { count: Infinity, transactions: [] };

  function backtrack(fromIndex: number, current: number[], transactions: Transaction[]): void {
    let start = fromIndex;
    while (start < current.length && current[start] === 0) start++;

    if (start === current.length) {
      if (transactions.length < best.count) {
        best = { count: transactions.length, transactions: [...transactions] };
      }
      return;
    }
    if (transactions.length >= best.count) return;

    const startAmount = current[start] ?? 0;
    for (let j = start + 1; j < current.length; j++) {
      const otherAmount = current[j] ?? 0;
      if (otherAmount === 0) continue;
      if ((startAmount > 0) === (otherAmount > 0)) continue;

      current[j] = otherAmount + startAmount;
      transactions.push(
        startAmount > 0
          ? { fromUserId: ids[j]!, toUserId: ids[start]!, amountCents: Math.abs(startAmount) }
          : { fromUserId: ids[start]!, toUserId: ids[j]!, amountCents: Math.abs(startAmount) },
      );

      backtrack(start + 1, current, transactions);

      transactions.pop();
      current[j] = otherAmount;
    }
  }

  backtrack(0, [...amounts], []);
  return best.transactions;
}

/**
 * Heuristica voraz: empareja repetidamente al acreedor con mayor saldo
 * pendiente con el deudor con mayor saldo pendiente, liquidando el importe
 * menor de los dos. Nunca genera mas de `n - 1` transacciones para `n`
 * balances no nulos, pero puede no ser el minimo absoluto si el conjunto se
 * puede particionar en subgrupos independientes que se saldan entre si.
 */
export function minimizeGreedy(balances: Balance[]): Transaction[] {
  const pending = balances.map((b) => ({ ...b })).filter((b) => b.netCents !== 0);
  const transactions: Transaction[] = [];

  while (pending.length > 1) {
    pending.sort((a, b) => b.netCents - a.netCents);
    const creditor = pending[0]!;
    const debtor = pending[pending.length - 1]!;
    if (creditor.netCents <= 0 || debtor.netCents >= 0) break;

    const amountCents = Math.min(creditor.netCents, -debtor.netCents);
    transactions.push({ fromUserId: debtor.userId, toUserId: creditor.userId, amountCents });
    creditor.netCents -= amountCents;
    debtor.netCents += amountCents;

    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i]!.netCents === 0) pending.splice(i, 1);
    }
  }

  return transactions;
}

/**
 * Calcula el conjunto de transacciones que liquida todos los balances con
 * el menor numero de movimientos posible (exacto si hay pocos balances
 * pendientes, heuristica voraz en caso contrario). Los balances deben sumar
 * exactamente 0 (todo lo que unos deben, otros lo deben recibir); si no es
 * asi hay un error de calculo previo (no deberia ocurrir si los gastos se
 * calcularon con `src/lib/money.ts`).
 */
export function minimizeTransactions(balances: Balance[]): Transaction[] {
  const nonZero = balances.filter((b) => b.netCents !== 0);
  if (nonZero.length === 0) return [];

  const sum = nonZero.reduce((total, b) => total + b.netCents, 0);
  if (sum !== 0) {
    throw new AppError(500, "Los balances netos deben sumar cero", "settlement_balances_not_zero_sum");
  }

  return nonZero.length <= EXACT_THRESHOLD ? minimizeExact(nonZero) : minimizeGreedy(nonZero);
}
