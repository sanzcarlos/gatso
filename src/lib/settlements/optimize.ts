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
 * - Hasta `EXACT_THRESHOLD` balances: backtracking exacto bipartito con
 *   poda (`minimizeExact`), que garantiza el numero minimo de
 *   transacciones y evita intermediarios: solo pagan quienes tienen saldo
 *   deudor. La complejidad es factorial en el peor caso, pero en la
 *   practica los subgrupos de gastos compartidos casi siempre tienen pocos
 *   participantes con saldo pendiente (la mayoria de gastos se acaban
 *   compensando entre si).
 * - Por encima de ese umbral (grupos grandes, hasta 64 miembros): heuristica
 *   voraz (`minimizeGreedy`, empareja siempre al mayor acreedor con el mayor
 *   deudor), que no garantiza el minimo absoluto pero si un resultado
 *   razonable en tiempo O(n^2 log n) y como mucho `n - 1` transacciones. Al
 *   operar siempre de deudor a acreedor, si garantiza el minimo numero de
 *   personas emisoras incluso cuando el numero de movimientos es heuristico.
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
 * Backtracking exacto sobre deudores y acreedores. En cada paso se toma el
 * primer deudor pendiente y se prueba contra cada acreedor, transfiriendo
 * el minimo de ambos saldos. Asi cada movimiento liquida al menos a una de
 * las dos personas y nunca convierte a un acreedor en intermediario que
 * tenga que enviar dinero despues.
 *
 * El criterio es lexicografico: primero menos transferencias y, en empate,
 * menos emisores distintos. Como todas las transferencias van directamente
 * de un deudor a un acreedor, se alcanza tambien el minimo teorico de
 * emisores: toda persona con balance negativo y ninguna otra.
 */
export function minimizeExact(balances: Balance[]): Transaction[] {
  const debtors = balances
    .filter((balance) => balance.netCents < 0)
    .map((balance) => ({ userId: balance.userId, remainingCents: -balance.netCents }));
  const creditors = balances
    .filter((balance) => balance.netCents > 0)
    .map((balance) => ({ userId: balance.userId, remainingCents: balance.netCents }));
  const greedyBaseline = minimizeGreedy(balances);
  let best: { transactionCount: number; senderCount: number; transactions: Transaction[] } = {
    transactionCount: greedyBaseline.length,
    senderCount: new Set(greedyBaseline.map((transaction) => transaction.fromUserId)).size,
    transactions: greedyBaseline,
  };
  const shortestPathToState = new Map<string, number>();

  function backtrack(transactions: Transaction[]): void {
    if (debtors.every((debtor) => debtor.remainingCents === 0)) {
      const senderCount = new Set(transactions.map((transaction) => transaction.fromUserId)).size;
      if (
        transactions.length < best.transactionCount ||
        (transactions.length === best.transactionCount && senderCount < best.senderCount)
      ) {
        best = { transactionCount: transactions.length, senderCount, transactions: [...transactions] };
      }
      return;
    }
    if (transactions.length >= best.transactionCount) return;

    const stateKey = `${debtors.map((debtor) => debtor.remainingCents).join(",")}|${creditors.map((creditor) => creditor.remainingCents).join(",")}`;
    const previousLength = shortestPathToState.get(stateKey);
    if (previousLength !== undefined && previousLength <= transactions.length) return;
    shortestPathToState.set(stateKey, transactions.length);

    const equivalentPairs = new Set<string>();
    for (const debtor of debtors) {
      if (debtor.remainingCents === 0) continue;
      for (const creditor of creditors) {
        if (creditor.remainingCents === 0) continue;
        const pairKey = `${debtor.remainingCents}:${creditor.remainingCents}`;
        if (equivalentPairs.has(pairKey)) continue;
        equivalentPairs.add(pairKey);

        const amountCents = Math.min(debtor.remainingCents, creditor.remainingCents);
        debtor.remainingCents -= amountCents;
        creditor.remainingCents -= amountCents;
        transactions.push({ fromUserId: debtor.userId, toUserId: creditor.userId, amountCents });

        backtrack(transactions);

        transactions.pop();
        debtor.remainingCents += amountCents;
        creditor.remainingCents += amountCents;
      }
    }
  }

  backtrack([]);
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
