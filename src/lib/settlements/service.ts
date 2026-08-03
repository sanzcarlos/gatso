import { and, eq, inArray } from "drizzle-orm";
import { db, expenses, expenseShares, memberships, users } from "@/db";
import { requireMembership } from "@/lib/groups/service";
import { parseAmountToCents } from "@/lib/money";
import { minimizeTransactions } from "./optimize";
import type { Balance } from "./optimize";

export interface SettlementBalance {
  userId: string;
  alias: string;
  /** Positivo = le deben dinero, negativo = debe dinero, en centimos. */
  netCents: number;
  hasLeftGroup: boolean;
}

export interface SettlementTransaction {
  fromUserId: string;
  fromAlias: string;
  fromHasLeftGroup: boolean;
  toUserId: string;
  toAlias: string;
  toHasLeftGroup: boolean;
  amountCents: number;
}

export interface CurrencySettlement {
  currencyCode: string;
  balances: SettlementBalance[];
  transactions: SettlementTransaction[];
}

/**
 * Calcula, para cada moneda presente en el ambito (grupo completo o un
 * subgrupo), el balance neto de cada usuario (lo que ha pagado menos lo
 * que le corresponde segun los repartos) y el conjunto minimo de
 * transacciones (`src/lib/settlements/optimize.ts`) que liquidaria todas
 * las deudas del grupo con el menor numero de movimientos posible (Fase 9).
 *
 * Incluye a usuarios que ya abandonaron el grupo (Fase 8) si tienen un
 * balance pendiente: sus gastos historicos siguen contando para el
 * calculo (no se borran ni se ignoran), marcados con `hasLeftGroup` para
 * que la UI pueda avisar de que ya no son miembros actuales.
 */
export async function getGroupSettlement(
  groupId: string,
  userId: string,
  subgroupId?: string,
): Promise<CurrencySettlement[]> {
  await requireMembership(groupId, userId);

  const conditions = subgroupId
    ? and(eq(expenses.groupId, groupId), eq(expenses.subgroupId, subgroupId))
    : eq(expenses.groupId, groupId);

  const expenseRows = await db
    .select({ id: expenses.id, payerId: expenses.payerId, amount: expenses.amount, currencyCode: expenses.currencyCode })
    .from(expenses)
    .where(conditions);

  const expenseIds = expenseRows.map((e) => e.id);
  const shareRows = expenseIds.length
    ? await db
        .select({ expenseId: expenseShares.expenseId, userId: expenseShares.userId, shareAmount: expenseShares.shareAmount })
        .from(expenseShares)
        .where(inArray(expenseShares.expenseId, expenseIds))
    : [];

  const currencyByExpenseId = new Map(expenseRows.map((e) => [e.id, e.currencyCode]));
  const netByCurrency = new Map<string, Map<string, number>>();

  function addNet(currencyCode: string, memberId: string, deltaCents: number) {
    const byMember = netByCurrency.get(currencyCode) ?? new Map<string, number>();
    byMember.set(memberId, (byMember.get(memberId) ?? 0) + deltaCents);
    netByCurrency.set(currencyCode, byMember);
  }

  for (const e of expenseRows) {
    addNet(e.currencyCode, e.payerId, parseAmountToCents(e.amount));
  }
  for (const s of shareRows) {
    const currencyCode = currencyByExpenseId.get(s.expenseId);
    if (!currencyCode) continue;
    addNet(currencyCode, s.userId, -parseAmountToCents(s.shareAmount));
  }

  const involvedUserIds = new Set<string>();
  for (const byMember of netByCurrency.values()) {
    for (const memberId of byMember.keys()) involvedUserIds.add(memberId);
  }

  const aliasRows = involvedUserIds.size
    ? await db.select({ id: users.id, alias: users.alias }).from(users).where(inArray(users.id, [...involvedUserIds]))
    : [];
  const aliasByUserId = new Map(aliasRows.map((u) => [u.id, u.alias]));

  const currentMembers = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.groupId, groupId));
  const currentMemberIds = new Set(currentMembers.map((m) => m.userId));

  function aliasOf(memberId: string): string {
    return aliasByUserId.get(memberId) ?? "Usuario";
  }
  function hasLeftGroupFor(memberId: string): boolean {
    return !currentMemberIds.has(memberId);
  }

  const settlements: CurrencySettlement[] = [];
  for (const [currencyCode, byMember] of netByCurrency) {
    const balances: Balance[] = [...byMember.entries()]
      .filter(([, netCents]) => netCents !== 0)
      .map(([memberId, netCents]) => ({ userId: memberId, netCents }));

    const settlementBalances: SettlementBalance[] = balances
      .map((b) => ({
        userId: b.userId,
        alias: aliasOf(b.userId),
        netCents: b.netCents,
        hasLeftGroup: hasLeftGroupFor(b.userId),
      }))
      .sort((a, b) => b.netCents - a.netCents);

    const transactions: SettlementTransaction[] = minimizeTransactions(balances).map((t) => ({
      fromUserId: t.fromUserId,
      fromAlias: aliasOf(t.fromUserId),
      fromHasLeftGroup: hasLeftGroupFor(t.fromUserId),
      toUserId: t.toUserId,
      toAlias: aliasOf(t.toUserId),
      toHasLeftGroup: hasLeftGroupFor(t.toUserId),
      amountCents: t.amountCents,
    }));

    if (settlementBalances.length > 0) {
      settlements.push({ currencyCode, balances: settlementBalances, transactions });
    }
  }

  return settlements.sort((a, b) => a.currencyCode.localeCompare(b.currencyCode));
}
