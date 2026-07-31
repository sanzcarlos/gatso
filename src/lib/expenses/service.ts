import { and, desc, eq } from "drizzle-orm";
import { db, expenses, expenseShares, subgroupMemberships, users, auditLogs } from "@/db";
import type { Tx } from "@/db";
import { AppError } from "@/lib/errors";
import { requireMembership } from "@/lib/groups/service";
import { getSubgroupInGroup } from "@/lib/groups/subgroup-service";
import { requireActiveCurrency } from "@/lib/currencies/service";
import { createNotification, resolveExpenseNotifications } from "@/lib/notifications/service";
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

async function loadExpenseWithShares(groupId: string, expenseId: string) {
  const [expense] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.groupId, groupId)))
    .limit(1);
  if (!expense) throw new AppError(404, "Gasto no encontrado", "expense_not_found");

  const shares = await db.select().from(expenseShares).where(eq(expenseShares.expenseId, expenseId));
  return { expense, shares };
}

async function logExpenseChange(
  tx: Tx,
  params: {
    actorUserId: string;
    action: "create" | "update" | "delete";
    groupId: string;
    expenseId: string;
    beforeData: unknown;
    afterData: unknown;
  },
) {
  await tx.insert(auditLogs).values({
    actorUserId: params.actorUserId,
    action: params.action,
    entityType: "expense",
    entityId: params.expenseId,
    groupId: params.groupId,
    beforeData: params.beforeData ?? null,
    afterData: params.afterData ?? null,
  });
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

    const insertedShares = await tx
      .insert(expenseShares)
      .values(
        shares.map((share) => ({
          expenseId: expense.id,
          userId: share.userId,
          shareAmount: centsToAmount(share.shareAmountCents),
          sharePercentage:
            share.sharePercentageBasisPoints !== null
              ? (share.sharePercentageBasisPoints / 100).toFixed(2)
              : null,
        })),
      )
      .returning();

    await logExpenseChange(tx, {
      actorUserId: actingUserId,
      action: "create",
      groupId,
      expenseId: expense.id,
      beforeData: null,
      afterData: { expense, shares: insertedShares },
    });

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
 * Un gasto puede ser editado por quien lo creo (edicion propia, se marca
 * como "modified", solo informativo) o por el administrador del grupo
 * (edicion ajena: el gasto pasa a "pending_validation" y se notifica al
 * creador original, que debe validarlo via `validateExpense`).
 */
export async function updateExpense(
  groupId: string,
  expenseId: string,
  actingUserId: string,
  input: CreateExpenseInput,
) {
  const membership = await requireMembership(groupId, actingUserId);
  const { expense: currentExpense, shares: currentShares } = await loadExpenseWithShares(groupId, expenseId);

  const isOwnExpense = currentExpense.createdBy === actingUserId;
  const canEdit = isOwnExpense || membership.role === "admin";
  if (!canEdit) {
    throw new AppError(
      403,
      "Solo quien creo el gasto o el administrador del grupo pueden editarlo",
      "forbidden_expense_update",
    );
  }

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
  const newStatus = isOwnExpense ? "modified" : "pending_validation";

  return db.transaction(async (tx) => {
    const [updatedExpense] = await tx
      .update(expenses)
      .set({
        subgroupId: input.subgroupId ?? null,
        payerId: input.payerId,
        amount: centsToAmount(totalCents),
        currencyCode: input.currencyCode,
        description: input.description,
        expenseDate: input.expenseDate,
        splitMethod: input.split.method,
        status: newStatus,
        lastEditedBy: actingUserId,
        updatedAt: new Date(),
      })
      .where(eq(expenses.id, expenseId))
      .returning();
    if (!updatedExpense) throw new AppError(500, "No se pudo actualizar el gasto");

    await tx.delete(expenseShares).where(eq(expenseShares.expenseId, expenseId));
    const insertedShares = await tx
      .insert(expenseShares)
      .values(
        shares.map((share) => ({
          expenseId,
          userId: share.userId,
          shareAmount: centsToAmount(share.shareAmountCents),
          sharePercentage:
            share.sharePercentageBasisPoints !== null
              ? (share.sharePercentageBasisPoints / 100).toFixed(2)
              : null,
        })),
      )
      .returning();

    await logExpenseChange(tx, {
      actorUserId: actingUserId,
      action: "update",
      groupId,
      expenseId,
      beforeData: { expense: currentExpense, shares: currentShares },
      afterData: { expense: updatedExpense, shares: insertedShares },
    });

    if (!isOwnExpense) {
      await createNotification(tx, {
        userId: currentExpense.createdBy,
        type: "expense_pending_validation",
        groupId,
        expenseId,
        message: `Tu gasto "${updatedExpense.description}" ha sido editado por un administrador y necesita tu validacion.`,
      });
    }

    return updatedExpense;
  });
}

/**
 * Solo el creador original de un gasto puede validar un cambio pendiente
 * (edicion realizada por otro usuario/admin). Al validar, el gasto vuelve
 * a "confirmed" y se resuelven las notificaciones asociadas.
 */
export async function validateExpense(groupId: string, expenseId: string, actingUserId: string) {
  await requireMembership(groupId, actingUserId);
  const { expense: currentExpense } = await loadExpenseWithShares(groupId, expenseId);

  if (currentExpense.createdBy !== actingUserId) {
    throw new AppError(403, "Solo el creador del gasto puede validar este cambio", "forbidden_expense_validate");
  }
  if (currentExpense.status !== "pending_validation") {
    throw new AppError(400, "Este gasto no tiene cambios pendientes de validar", "expense_not_pending");
  }

  return db.transaction(async (tx) => {
    const [validated] = await tx
      .update(expenses)
      .set({ status: "confirmed", updatedAt: new Date() })
      .where(eq(expenses.id, expenseId))
      .returning();
    if (!validated) throw new AppError(500, "No se pudo validar el gasto");

    await logExpenseChange(tx, {
      actorUserId: actingUserId,
      action: "update",
      groupId,
      expenseId,
      beforeData: { expense: currentExpense },
      afterData: { expense: validated, validated: true },
    });

    await resolveExpenseNotifications(tx, expenseId);

    return validated;
  });
}

/**
 * Historial completo de cambios de un gasto (creacion, ediciones,
 * validaciones, borrado). Se apoya en `audit_logs` filtrando por grupo, asi
 * que sigue disponible aunque el gasto ya se haya borrado.
 */
export async function getExpenseHistory(groupId: string, expenseId: string, userId: string) {
  await requireMembership(groupId, userId);

  return db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      actorUserId: auditLogs.actorUserId,
      actorAlias: users.alias,
      beforeData: auditLogs.beforeData,
      afterData: auditLogs.afterData,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .innerJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(and(eq(auditLogs.entityType, "expense"), eq(auditLogs.entityId, expenseId), eq(auditLogs.groupId, groupId)))
    .orderBy(desc(auditLogs.createdAt));
}

/**
 * Un gasto solo puede ser borrado por quien lo creo o por el
 * administrador del grupo (Fase 4). Se implementa ya aqui porque es un
 * requisito de integridad inseparable de la propia creacion del gasto.
 */
export async function deleteExpense(groupId: string, expenseId: string, actingUserId: string) {
  const membership = await requireMembership(groupId, actingUserId);
  const { expense, shares } = await loadExpenseWithShares(groupId, expenseId);

  const canDelete = expense.createdBy === actingUserId || membership.role === "admin";
  if (!canDelete) {
    throw new AppError(
      403,
      "Solo quien creo el gasto o el administrador del grupo pueden borrarlo",
      "forbidden_expense_delete",
    );
  }

  return db.transaction(async (tx) => {
    await logExpenseChange(tx, {
      actorUserId: actingUserId,
      action: "delete",
      groupId,
      expenseId,
      beforeData: { expense, shares },
      afterData: null,
    });
    await tx.delete(expenses).where(eq(expenses.id, expenseId));
    return expense;
  });
}
