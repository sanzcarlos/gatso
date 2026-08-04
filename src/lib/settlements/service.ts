import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, expenses, expenseShares, memberships, users, groups, currencies, settlementPayments } from "@/db";
import { requireMembership } from "@/lib/groups/service";
import { parseAmountToCents, centsToAmount } from "@/lib/money";
import { convertCents } from "@/lib/exchange-rates/service";
import { recordAuditLog } from "@/lib/audit/service";
import { createNotification } from "@/lib/notifications/service";
import { AppError } from "@/lib/errors";
import { SETTLEMENT_METHOD_LABEL, type SettlementPaymentMethod } from "./methods";
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
export interface GroupSettlementResult {
  baseCurrencyCode: string;
  settlements: CurrencySettlement[];
  /** Fase 10: liquidacion combinada, convirtiendo todas las monedas a la moneda base del grupo. Null si solo hay una moneda (seria igual al elemento de `settlements`) o falta algun cambio. */
  convertedOverall: CurrencySettlement | null;
}

export async function getGroupSettlement(
  groupId: string,
  userId: string,
  subgroupId?: string,
): Promise<GroupSettlementResult> {
  await requireMembership(groupId, userId);

  const conditions = subgroupId
    ? and(eq(expenses.groupId, groupId), eq(expenses.subgroupId, subgroupId))
    : eq(expenses.groupId, groupId);

  const [expenseRows, [group]] = await Promise.all([
    db
      .select({ id: expenses.id, payerId: expenses.payerId, amount: expenses.amount, currencyCode: expenses.currencyCode })
      .from(expenses)
      .where(conditions),
    db.select({ baseCurrencyCode: groups.baseCurrencyCode }).from(groups).where(eq(groups.id, groupId)).limit(1),
  ]);
  const baseCurrencyCode = group?.baseCurrencyCode ?? "EUR";

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

  /**
   * Fase 9 (ampliacion): las deudas ya marcadas como pagadas (`recordSettlementPayment`)
   * se restan de los balances netos antes de recalcular el optimo, para que
   * una transaccion ya saldada fuera de la app deje de aparecer como
   * pendiente. Se aplican en el mismo ambito (grupo completo o subgrupo)
   * con el que se calculo esta liquidacion.
   */
  const paymentCondition = subgroupId
    ? and(eq(settlementPayments.groupId, groupId), eq(settlementPayments.subgroupId, subgroupId))
    : and(eq(settlementPayments.groupId, groupId), isNull(settlementPayments.subgroupId));
  const paymentRows = await db
    .select({
      fromUserId: settlementPayments.fromUserId,
      toUserId: settlementPayments.toUserId,
      amount: settlementPayments.amount,
      currencyCode: settlementPayments.currencyCode,
    })
    .from(settlementPayments)
    .where(paymentCondition);
  for (const p of paymentRows) {
    const amountCents = parseAmountToCents(p.amount);
    addNet(p.currencyCode, p.fromUserId, amountCents);
    addNet(p.currencyCode, p.toUserId, -amountCents);
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

  const sortedSettlements = settlements.sort((a, b) => a.currencyCode.localeCompare(b.currencyCode));

  let convertedOverall: CurrencySettlement | null = null;
  if (netByCurrency.size > 1) {
    const convertedNetByMember = new Map<string, number>();
    try {
      for (const [currencyCode, byMember] of netByCurrency) {
        for (const [memberId, netCents] of byMember) {
          const converted = await convertCents(netCents, currencyCode, baseCurrencyCode);
          convertedNetByMember.set(memberId, (convertedNetByMember.get(memberId) ?? 0) + converted);
        }
      }

      const balances: Balance[] = [...convertedNetByMember.entries()]
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
        convertedOverall = { currencyCode: baseCurrencyCode, balances: settlementBalances, transactions };
      }
    } catch {
      convertedOverall = null;
    }
  }

  return { baseCurrencyCode, settlements: sortedSettlements, convertedOverall };
}

export interface RecordSettlementPaymentInput {
  subgroupId?: string | undefined;
  fromUserId: string;
  toUserId: string;
  amountCents: number;
  currencyCode: string;
  method: SettlementPaymentMethod;
}

/**
 * Registra que una transaccion sugerida por la liquidacion se ha efectuado
 * realmente fuera de la app (Fase 9 ampliada). Solo los dos implicados en la deuda
 * o un administrador del grupo pueden marcarla como pagada. Avisa al otro
 * implicado (no al que registra el pago) mediante una notificacion que
 * incluye el importe y el metodo utilizado.
 */
export async function recordSettlementPayment(
  groupId: string,
  actingUserId: string,
  input: RecordSettlementPaymentInput,
) {
  const membership = await requireMembership(groupId, actingUserId);
  if (membership.role !== "admin" && actingUserId !== input.fromUserId && actingUserId !== input.toUserId) {
    throw new AppError(
      403,
      "Solo los implicados en la deuda o un administrador pueden marcarla como pagada",
      "not_settlement_participant",
    );
  }

  const [currency] = await db
    .select({ code: currencies.code })
    .from(currencies)
    .where(eq(currencies.code, input.currencyCode))
    .limit(1);
  if (!currency) {
    throw new AppError(400, `Moneda no soportada: "${input.currencyCode}"`, "unsupported_currency");
  }

  const [[fromUser], [toUser]] = await Promise.all([
    db.select({ alias: users.alias }).from(users).where(eq(users.id, input.fromUserId)).limit(1),
    db.select({ alias: users.alias }).from(users).where(eq(users.id, input.toUserId)).limit(1),
  ]);
  if (!fromUser || !toUser) {
    throw new AppError(404, "Usuario no encontrado", "user_not_found");
  }

  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(settlementPayments)
      .values({
        groupId,
        subgroupId: input.subgroupId ?? null,
        fromUserId: input.fromUserId,
        toUserId: input.toUserId,
        amount: centsToAmount(input.amountCents),
        currencyCode: input.currencyCode,
        method: input.method,
        recordedBy: actingUserId,
      })
      .returning();
    if (!inserted) throw new AppError(500, "No se pudo registrar el pago");

    await recordAuditLog(tx, {
      actorUserId: actingUserId,
      action: "create",
      entityType: "settlement_payment",
      entityId: inserted.id,
      groupId,
      afterData: inserted,
    });

    const recipients = new Set([input.fromUserId, input.toUserId]);
    recipients.delete(actingUserId);
    const message = `${fromUser.alias} ha pagado a ${toUser.alias} ${centsToAmount(input.amountCents)} ${input.currencyCode} (${SETTLEMENT_METHOD_LABEL[input.method]}).`;
    for (const userId of recipients) {
      await createNotification(tx, {
        userId,
        type: "settlement_payment_recorded",
        groupId,
        message,
      });
    }

    return inserted;
  });
}
