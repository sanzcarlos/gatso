import { and, desc, eq } from "drizzle-orm";
import { db, expenses, expenseShares, subgroupMemberships, users } from "@/db";
import { AppError } from "@/lib/errors";
import { requireMembership } from "@/lib/groups/service";
import { getSubgroupInGroup } from "@/lib/groups/subgroup-service";
import { requireActiveCurrency } from "@/lib/currencies/service";
import { computeShares } from "./split-strategies";
import { parseAmountToCents, centsToAmount } from "@/lib/money";
import { enforceExpenseCreationRateLimit } from "./rate-limit";
import type { CreateExpenseInput } from "@/lib/validation/expenses";

/**
 * Verifica que todos los userId referenciados en el reparto (y el pagador)
 * sean miembros del grupo (y, si aplica, del subgrupo). Evita que alguien
 * cree un gasto repartido con usuarios ajenos al grupo.
 */
async function assertParticipantsBelongToScope(
  groupId: string,
  subgroupId: string | undefined,
  userIds: string[],
) {
  for (const userId of new Set(userIds)) {
    await requireMembership(groupId, userId).catch(() => {
      throw new AppError(400, "Todos los participantes deben ser miembros del grupo", "participant_not_in_group");
    });
  }

  if (!subgroupId) return;
  const members = await db
    .select({ userId: subgroupMemberships.userId })
    .from(subgroupMemberships)
    .where(eq(subgroupMemberships.subgroupId, subgroupId));
  const subgroupUserIds = new Set(members.map((m) => m.userId));
  for (const userId of new Set(userIds)) {
    if (!subgroupUserIds.has(userId)) {
      throw new AppError(
        400,
        "Todos los participantes deben ser miembros del subgrupo seleccionado",
        "participant_not_in_subgroup",
      );
    }
  }
}

function getSplitUserIds(split: CreateExpenseInput["split"]): string[] {
  if (split.method === "equal") return split.participantUserIds;
  return split.shares.map((s) => s.userId);
}

export async function createExpense(groupId: string, actingUserId: string, input: CreateExpenseInput) {
  await requireMembership(groupId, actingUserId);
  await requireActiveCurrency(input.currencyCode);

  if (input.subgroupId) {
    await getSubgroupInGroup(groupId, input.subgroupId);
  }

  await requireMembership(groupId, input.payerId).catch(() => {
    throw new AppError(400, "El pagador debe ser miembro del grupo", "payer_not_in_group");
  });

  const totalCents = parseAmountToCents(input.amount);
  const participantIds = getSplitUserIds(input.split);
  await assertParticipantsBelongToScope(groupId, input.subgroupId, [...participantIds, input.payerId]);

  const shares = computeShares(totalCents, input.split);

  return db.transaction(async (tx) => {
    await enforceExpenseCreationRateLimit(tx, actingUserId);

    const [expense] = await tx
      .insert(expenses)
      .values({
        groupId,
        subgroupId: input.subgroupId ?? null,
        payerId: input.payerId,
        amount: centsToAmount(totalCents),
        currencyCode: input.currencyCode,
        description: input.description,
        expenseDate: input.expenseDate,
        splitMethod: input.split.method,
        createdBy: actingUserId,
      })
      .returning();
    if (!expense) throw new AppError(500, "No se pudo crear el gasto");

    await tx.insert(expenseShares).values(
      shares.map((share) => ({
        expenseId: expense.id,
        userId: share.userId,
        shareAmount: centsToAmount(share.shareAmountCents),
        sharePercentage:
          share.sharePercentageBasisPoints !== null
            ? (share.sharePercentageBasisPoints / 100).toFixed(2)
            : null,
      })),
    );

    return expense;
  });
}

export async function listExpenses(groupId: string, userId: string, subgroupId?: string) {
  await requireMembership(groupId, userId);
  const conditions = subgroupId
    ? and(eq(expenses.groupId, groupId), eq(expenses.subgroupId, subgroupId))
    : eq(expenses.groupId, groupId);

  return db
    .select({
      expense: expenses,
      payerAlias: users.alias,
    })
    .from(expenses)
    .innerJoin(users, eq(users.id, expenses.payerId))
    .where(conditions)
    .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt));
}

export async function getExpenseDetail(groupId: string, expenseId: string, userId: string) {
  await requireMembership(groupId, userId);

  const [expense] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.groupId, groupId)))
    .limit(1);
  if (!expense) throw new AppError(404, "Gasto no encontrado", "expense_not_found");

  const shares = await db
    .select({
      userId: expenseShares.userId,
      alias: users.alias,
      shareAmount: expenseShares.shareAmount,
      sharePercentage: expenseShares.sharePercentage,
    })
    .from(expenseShares)
    .innerJoin(users, eq(users.id, expenseShares.userId))
    .where(eq(expenseShares.expenseId, expenseId));

  return { expense, shares };
}

/**
 * Un gasto solo puede ser borrado por quien lo creo o por el
 * administrador del grupo (Fase 4). Se implementa ya aqui porque es un
 * requisito de integridad inseparable de la propia creacion del gasto.
 */
export async function deleteExpense(groupId: string, expenseId: string, actingUserId: string) {
  const membership = await requireMembership(groupId, actingUserId);

  const [expense] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.groupId, groupId)))
    .limit(1);
  if (!expense) throw new AppError(404, "Gasto no encontrado", "expense_not_found");

  const canDelete = expense.createdBy === actingUserId || membership.role === "admin";
  if (!canDelete) {
    throw new AppError(
      403,
      "Solo quien creo el gasto o el administrador del grupo pueden borrarlo",
      "forbidden_expense_delete",
    );
  }

  await db.delete(expenses).where(eq(expenses.id, expenseId));
  return expense;
}
