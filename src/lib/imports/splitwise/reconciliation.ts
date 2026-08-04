import { parseAmountToCents } from "@/lib/money";
import type { SplitwiseExpense } from "./client";

/**
 * Reconciliacion de balances (Fase 11, backlog: "Antes de confirmar,
 * comparar balances de origen y destino por moneda y participante [...]
 * Tras importar, recalcular y no marcar completed si existe una
 * diferencia distinta de cero"). Funciones puras, testeables sin red ni
 * base de datos; la orquestacion con BD/API vive en
 * `reconciliation-service.ts`.
 */

/** Clave interna `${currencyCode}:${key}` para los mapas de balances (key = id externo o id Gatso, segun el mapa). */
export function balanceKey(currencyCode: string, id: string): string {
  return `${currencyCode}:${id}`;
}

/**
 * Suma el `net_balance` que Splitwise ya calcula por gasto/usuario (mas
 * fiable que recalcularlo nosotros mismos: incluye tanto gastos reales
 * como pagos/liquidaciones, que tambien afectan al balance). Los gastos
 * borrados se excluyen (backlog: "no se importan"), igual que en
 * `preview-service.ts`.
 */
export function buildSplitwiseNetBalances(expenses: SplitwiseExpense[]): Map<string, number> {
  const balances = new Map<string, number>();
  for (const expense of expenses) {
    if (expense.deleted_at) continue;
    for (const share of expense.users) {
      if (share.net_balance === undefined) continue;
      const key = balanceKey(expense.currency_code, String(share.user_id));
      balances.set(key, (balances.get(key) ?? 0) + parseAmountToCents(share.net_balance));
    }
  }
  return balances;
}

/** Traduce las claves de un mapa de balances de id externo a id Gatso segun el mapeo de usuarios; descarta entradas sin mapeo (no se pueden comparar). */
export function translateBalanceKeys(balances: Map<string, number>, externalToGatsoUserId: Map<string, string>): Map<string, number> {
  const translated = new Map<string, number>();
  for (const [key, cents] of balances) {
    const separatorIndex = key.indexOf(":");
    const currencyCode = key.slice(0, separatorIndex);
    const externalUserId = key.slice(separatorIndex + 1);
    const gatsoUserId = externalToGatsoUserId.get(externalUserId);
    if (!gatsoUserId) continue;
    const newKey = balanceKey(currencyCode, gatsoUserId);
    translated.set(newKey, (translated.get(newKey) ?? 0) + cents);
  }
  return translated;
}

export interface ReconciliationDiscrepancy {
  currencyCode: string;
  gatsoUserId: string;
  splitwiseCents: number;
  gatsoCents: number;
  diffCents: number;
}

/** Compara dos mapas de balances (mismo espacio de claves: `${currencyCode}:${gatsoUserId}`) y devuelve solo las discrepancias. */
export function diffBalances(splitwise: Map<string, number>, gatso: Map<string, number>): ReconciliationDiscrepancy[] {
  const keys = new Set([...splitwise.keys(), ...gatso.keys()]);
  const discrepancies: ReconciliationDiscrepancy[] = [];
  for (const key of keys) {
    const separatorIndex = key.indexOf(":");
    const currencyCode = key.slice(0, separatorIndex);
    const gatsoUserId = key.slice(separatorIndex + 1);
    const splitwiseCents = splitwise.get(key) ?? 0;
    const gatsoCents = gatso.get(key) ?? 0;
    if (splitwiseCents !== gatsoCents) {
      discrepancies.push({ currencyCode, gatsoUserId, splitwiseCents, gatsoCents, diffCents: gatsoCents - splitwiseCents });
    }
  }
  return discrepancies.sort((a, b) => a.currencyCode.localeCompare(b.currencyCode) || a.gatsoUserId.localeCompare(b.gatsoUserId));
}
