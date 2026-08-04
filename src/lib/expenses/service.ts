import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import { db, expenses, expenseShares, memberships, subgroupMemberships, users, auditLogs, groups } from "@/db";
import { AppError } from "@/lib/errors";
import { isUniqueViolation } from "@/lib/db/errors";
import { requireMembership } from "@/lib/groups/service";
import { getSubgroupInGroup } from "@/lib/groups/subgroup-service";
import { requireActiveCurrency } from "@/lib/currencies/service";
import { convertCents } from "@/lib/exchange-rates/service";
import { createNotification, resolveExpenseNotifications } from "@/lib/notifications/service";
import { recordAuditLog } from "@/lib/audit/service";
import { computeShares } from "./split-strategies";
import { parseAmountToCents, centsToAmount } from "@/lib/money";
import { enforceExpenseCreationRateLimit } from "./rate-limit";
import { DEFAULT_PAGE_LIMIT, clampLimit, decodeCursor, encodeCursor, type Page } from "@/lib/pagination";
import type { CreateExpenseInput } from "@/lib/validation/expenses";

export interface ExpenseListCursor {
  expenseDate: string;
  createdAt: string;
  id: string;
}

export interface ListExpensesOptions {
  subgroupId?: string | undefined;
  cursor?: string | null | undefined;
  limit?: number | undefined;
}

/**
 * Verifica que todos los userId referenciados en el reparto (y el pagador)
 * sean miembros del grupo (y, si aplica, del subgrupo). Evita que alguien
 * cree un gasto repartido con usuarios ajenos al grupo.
 *
 * `grandfatheredUserIds` (Fase 8) exime de esta comprobacion a usuarios
 * que ya formaban parte del gasto ANTES de la edicion actual (pagador o
 * participante de un reparto ya existente): si un usuario abandono el
 * grupo despues de participar en un gasto, `updateExpense` debe poder
 * seguir guardando ese gasto sin verse obligado a expulsarlo del reparto
 * historico. Los participantes nuevos anadidos durante la edicion (no
 * grandfathered) siguen exigiendo membresia real, igual que en la
 * creacion.
 */
async function assertParticipantsBelongToScope(
  groupId: string,
  subgroupId: string | undefined,
  userIds: string[],
  grandfatheredUserIds: ReadonlySet<string> = new Set(),
) {
  for (const userId of new Set(userIds)) {
    if (grandfatheredUserIds.has(userId)) continue;
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
    if (grandfatheredUserIds.has(userId)) continue;
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

/**
 * Busca un gasto ya creado con este `clientRequestId` (Fase 10, cola
 * offline): un `POST` reenviado tras un fallo de red con el mismo id debe
 * devolver el gasto ya existente en vez de crear un duplicado. Se busca
 * solo dentro del grupo indicado, aunque `clientRequestId` ya es unico a
 * nivel global (generado por `crypto.randomUUID()` en el cliente).
 */
async function findExpenseByClientRequestId(groupId: string, clientRequestId: string) {
  const [expense] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.groupId, groupId), eq(expenses.clientRequestId, clientRequestId)))
    .limit(1);
  return expense ?? null;
}

export interface CreateExpenseOptions {
  /**
   * Omite el rate limit de creacion de gastos (Fase 11: el job de
   * importacion desde Splitwise crea muchos gastos en rafaga a nombre de
   * quien ejecuta la importacion; aplicarle el limite de "1 gasto cada N
   * segundos" pensado para uso interactivo normal romperia cualquier
   * importacion con mas de un gasto). Nunca se expone via ninguna ruta
   * HTTP/schema publico; solo lo usa `src/lib/imports/splitwise/job-service.ts`.
   */
  skipRateLimit?: boolean;
}

export async function createExpense(
  groupId: string,
  actingUserId: string,
  input: CreateExpenseInput,
  options?: CreateExpenseOptions,
) {
  await requireMembership(groupId, actingUserId);

  if (input.clientRequestId) {
    const existing = await findExpenseByClientRequestId(groupId, input.clientRequestId);
    if (existing) return existing;
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

  try {
    return await db.transaction(async (tx) => {
      if (!options?.skipRateLimit) {
        await enforceExpenseCreationRateLimit(tx, actingUserId);
      }

      const [expense] = await tx
        .insert(expenses)
        .values({
          groupId,
          subgroupId: input.subgroupId ?? null,
          payerId: input.payerId,
          amount: centsToAmount(totalCents),
          currencyCode: input.currencyCode,
          description: input.description,
          notes: input.notes?.trim() || null,
          expenseDate: input.expenseDate,
          splitMethod: input.split.method,
          createdBy: actingUserId,
          clientRequestId: input.clientRequestId ?? null,
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

      await recordAuditLog(tx, {
        actorUserId: actingUserId,
        action: "create",
        entityType: "expense",
        entityId: expense.id,
        groupId,
        beforeData: null,
        afterData: { expense, shares: insertedShares },
      });

      return expense;
    });
  } catch (error) {
    if (input.clientRequestId && isUniqueViolation(error)) {
      const existing = await findExpenseByClientRequestId(groupId, input.clientRequestId);
      if (existing) return existing;
    }
    throw error;
  }
}

/**
 * Lista los gastos de un grupo (o de un subgrupo si se indica). Incluye
 * `payerHasLeftGroup` (Fase 8, `LEFT JOIN` contra `memberships`): si el
 * pagador ya no tiene una fila de membresia en este grupo, es que lo
 * abandono (o fue expulsado) despues de pagar el gasto; el gasto en si
 * nunca se borra ni se modifica por ese motivo, solo se marca en la UI.
 *
 * Fase 10: cuando un gasto esta en una moneda distinta de la moneda base
 * del grupo (`groups.baseCurrencyCode`), se incluye tambien
 * `convertedAmount`/`groupBaseCurrencyCode` con el importe equivalente
 * convertido segun el cambio de referencia del BCE
 * (`src/lib/exchange-rates/service.ts`), para que la UI pueda mostrar
 * "42.00 USD (~38.50 EUR)" sin que el cliente tenga que hacer la
 * conversion el mismo.
 */
export async function listExpenses(groupId: string, userId: string, options: ListExpensesOptions = {}) {
  await requireMembership(groupId, userId);
  const { subgroupId } = options;
  const pageSize = clampLimit(options.limit ? String(options.limit) : null, DEFAULT_PAGE_LIMIT);
  const cursor = decodeCursor<ExpenseListCursor>(options.cursor);

  const scopeCondition = subgroupId
    ? and(eq(expenses.groupId, groupId), eq(expenses.subgroupId, subgroupId))
    : eq(expenses.groupId, groupId);

  // Paginacion por cursor (keyset) sobre (expenseDate, createdAt, id) para
  // que coincida exactamente con el `orderBy` usado: evita los duplicados
  // o huecos que produciria un `offset` numerico si se inserta un gasto
  // nuevo entre dos paginas.
  const cursorCondition = cursor
    ? or(
        lt(expenses.expenseDate, cursor.expenseDate),
        and(eq(expenses.expenseDate, cursor.expenseDate), lt(expenses.createdAt, new Date(cursor.createdAt))),
        and(
          eq(expenses.expenseDate, cursor.expenseDate),
          eq(expenses.createdAt, new Date(cursor.createdAt)),
          lt(expenses.id, cursor.id),
        ),
      )
    : undefined;

  const whereCondition = cursorCondition ? and(scopeCondition, cursorCondition) : scopeCondition;

  const [rows, [group]] = await Promise.all([
    db
      .select({
        expense: expenses,
        payerDisplayName: users.displayName,
        payerMembershipId: memberships.id,
      })
      .from(expenses)
      .innerJoin(users, eq(users.id, expenses.payerId))
      .leftJoin(memberships, and(eq(memberships.groupId, groupId), eq(memberships.userId, expenses.payerId)))
      .where(whereCondition)
      .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt), desc(expenses.id))
      .limit(pageSize + 1),
    db.select({ baseCurrencyCode: groups.baseCurrencyCode }).from(groups).where(eq(groups.id, groupId)).limit(1),
  ]);

  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
  const baseCurrencyCode = group?.baseCurrencyCode ?? "EUR";

  const items = await Promise.all(
    pageRows.map(async ({ payerMembershipId, ...rest }) => {
      let convertedAmount: string | null = null;
      if (rest.expense.currencyCode !== baseCurrencyCode) {
        try {
          const cents = await convertCents(parseAmountToCents(rest.expense.amount), rest.expense.currencyCode, baseCurrencyCode);
          convertedAmount = centsToAmount(cents);
        } catch {
          convertedAmount = null;
        }
      }
      return {
        ...rest,
        payerHasLeftGroup: payerMembershipId === null,
        groupBaseCurrencyCode: baseCurrencyCode,
        convertedAmount,
      };
    }),
  );

  const last = pageRows[pageRows.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({
          expenseDate: last.expense.expenseDate,
          createdAt: last.expense.createdAt.toISOString(),
          id: last.expense.id,
        })
      : null;

  return { items, nextCursor } satisfies Page<(typeof items)[number]>;
}

export interface MemberAmount {
  userId: string;
  displayName: string;
  totalCents: number;
  /** Fase 8: true si el usuario ya no es miembro actual del grupo. */
  hasLeftGroup: boolean;
}

export interface CurrencyExpenseStats {
  currencyCode: string;
  totalCents: number;
  paidByMember: MemberAmount[];
  shareByMember: MemberAmount[];
  /** Fase 10: `totalCents` convertido a la moneda base del grupo (null si el cambio no esta disponible). */
  convertedTotalCents: number | null;
}

export interface ExpenseStatsResult {
  baseCurrencyCode: string;
  /** Suma de `convertedTotalCents` de todas las monedas (null si falta el cambio de alguna). */
  totalConvertedCents: number | null;
  stats: CurrencyExpenseStats[];
}

/**
 * Estadisticas agregadas de gastos para graficas (grupo completo o un
 * subgrupo): por cada moneda presente en el ambito, cuanto ha pagado cada
 * miembro (`paidByMember`) y cuanto le corresponde segun el reparto
 * (`shareByMember`). Se separan por moneda porque sumar importes de
 * monedas distintas sin conversion daria una cifra sin sentido.
 */
export async function getExpenseStats(
  groupId: string,
  userId: string,
  subgroupId?: string,
): Promise<ExpenseStatsResult> {
  await requireMembership(groupId, userId);
  const conditions = subgroupId
    ? and(eq(expenses.groupId, groupId), eq(expenses.subgroupId, subgroupId))
    : eq(expenses.groupId, groupId);

  const [expenseRows, [group]] = await Promise.all([
    db
      .select({
        id: expenses.id,
        payerId: expenses.payerId,
        amount: expenses.amount,
        currencyCode: expenses.currencyCode,
      })
      .from(expenses)
      .where(conditions),
    db.select({ baseCurrencyCode: groups.baseCurrencyCode }).from(groups).where(eq(groups.id, groupId)).limit(1),
  ]);
  const baseCurrencyCode = group?.baseCurrencyCode ?? "EUR";

  const expenseIds = expenseRows.map((e) => e.id);
  const shareRows = expenseIds.length
    ? await db
        .select({
          expenseId: expenseShares.expenseId,
          userId: expenseShares.userId,
          shareAmount: expenseShares.shareAmount,
        })
        .from(expenseShares)
        .where(inArray(expenseShares.expenseId, expenseIds))
    : [];

  const currencyByExpenseId = new Map(expenseRows.map((e) => [e.id, e.currencyCode]));
  const involvedUserIds = new Set<string>();
  for (const e of expenseRows) involvedUserIds.add(e.payerId);
  for (const s of shareRows) involvedUserIds.add(s.userId);

  const displayNameRows = involvedUserIds.size
    ? await db
        .select({ id: users.id, displayName: users.displayName })
        .from(users)
        .where(inArray(users.id, [...involvedUserIds]))
    : [];
  const displayNameByUserId = new Map(displayNameRows.map((u) => [u.id, u.displayName]));

  const currentMembers = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.groupId, groupId));
  const currentMemberIds = new Set(currentMembers.map((m) => m.userId));

  const paidTotals = new Map<string, Map<string, number>>();
  const shareTotals = new Map<string, Map<string, number>>();

  function addTo(map: Map<string, Map<string, number>>, currencyCode: string, memberId: string, cents: number) {
    const byMember = map.get(currencyCode) ?? new Map<string, number>();
    byMember.set(memberId, (byMember.get(memberId) ?? 0) + cents);
    map.set(currencyCode, byMember);
  }

  for (const e of expenseRows) {
    addTo(paidTotals, e.currencyCode, e.payerId, parseAmountToCents(e.amount));
  }
  for (const s of shareRows) {
    const currencyCode = currencyByExpenseId.get(s.expenseId);
    if (!currencyCode) continue;
    addTo(shareTotals, currencyCode, s.userId, parseAmountToCents(s.shareAmount));
  }

  const currencyCodes = new Set<string>([...paidTotals.keys(), ...shareTotals.keys()]);

  function toMemberAmounts(byMember: Map<string, number> | undefined): MemberAmount[] {
    if (!byMember) return [];
    return [...byMember.entries()]
      .map(([memberId, totalCents]) => ({
        userId: memberId,
        displayName: displayNameByUserId.get(memberId) ?? "Usuario",
        totalCents,
        hasLeftGroup: !currentMemberIds.has(memberId),
      }))
      .sort((a, b) => b.totalCents - a.totalCents);
  }

  const stats: CurrencyExpenseStats[] = await Promise.all(
    [...currencyCodes].map(async (currencyCode) => {
      const paidByMember = toMemberAmounts(paidTotals.get(currencyCode));
      const totalCents = paidByMember.reduce((sum, m) => sum + m.totalCents, 0);
      let convertedTotalCents: number | null = null;
      try {
        convertedTotalCents = await convertCents(totalCents, currencyCode, baseCurrencyCode);
      } catch {
        convertedTotalCents = null;
      }
      return {
        currencyCode,
        totalCents,
        paidByMember,
        shareByMember: toMemberAmounts(shareTotals.get(currencyCode)),
        convertedTotalCents,
      };
    }),
  );

  const sortedStats = stats.sort((a, b) => b.totalCents - a.totalCents);
  const totalConvertedCents = sortedStats.some((s) => s.convertedTotalCents === null)
    ? null
    : sortedStats.reduce((sum, s) => sum + (s.convertedTotalCents ?? 0), 0);

  return { baseCurrencyCode, totalConvertedCents, stats: sortedStats };
}

/**
 * Detalle de un gasto (Fase 8: incluye `payerHasLeftGroup` y, por cada
 * reparto, `hasLeftGroup`, ambos via `LEFT JOIN` contra `memberships` de
 * este grupo) para que la UI de edicion pueda seguir mostrando a un
 * pagador/participante que ya abandono el grupo, en vez de ocultarlo o
 * romper el formulario.
 */
export async function getExpenseDetail(groupId: string, expenseId: string, userId: string) {
  await requireMembership(groupId, userId);

  const [row] = await db
    .select({
      expense: expenses,
      payerDisplayName: users.displayName,
      payerMembershipId: memberships.id,
    })
    .from(expenses)
    .innerJoin(users, eq(users.id, expenses.payerId))
    .leftJoin(memberships, and(eq(memberships.groupId, groupId), eq(memberships.userId, expenses.payerId)))
    .where(and(eq(expenses.id, expenseId), eq(expenses.groupId, groupId)))
    .limit(1);
  if (!row) throw new AppError(404, "Gasto no encontrado", "expense_not_found");

  const shareRows = await db
    .select({
      userId: expenseShares.userId,
      displayName: users.displayName,
      shareAmount: expenseShares.shareAmount,
      sharePercentage: expenseShares.sharePercentage,
      membershipId: memberships.id,
    })
    .from(expenseShares)
    .innerJoin(users, eq(users.id, expenseShares.userId))
    .leftJoin(memberships, and(eq(memberships.groupId, groupId), eq(memberships.userId, expenseShares.userId)))
    .where(eq(expenseShares.expenseId, expenseId));

  return {
    expense: row.expense,
    payerDisplayName: row.payerDisplayName,
    payerHasLeftGroup: row.payerMembershipId === null,
    shares: shareRows.map(({ membershipId, ...rest }) => ({ ...rest, hasLeftGroup: membershipId === null })),
  };
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

  /**
   * Fase 8: quienes ya eran pagador/participante de este gasto ANTES de
   * esta edicion quedan exentos de la comprobacion de membresia actual,
   * para no romper el guardado de un gasto historico solo porque uno de
   * sus participantes abandono el grupo entretanto.
   */
  const grandfatheredUserIds = new Set<string>([
    currentExpense.payerId,
    ...currentShares.map((share) => share.userId),
  ]);

  if (!grandfatheredUserIds.has(input.payerId)) {
    await requireMembership(groupId, input.payerId).catch(() => {
      throw new AppError(400, "El pagador debe ser miembro del grupo", "payer_not_in_group");
    });
  }

  const totalCents = parseAmountToCents(input.amount);
  const participantIds = getSplitUserIds(input.split);
  await assertParticipantsBelongToScope(
    groupId,
    input.subgroupId,
    [...participantIds, input.payerId],
    grandfatheredUserIds,
  );

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
        notes: input.notes?.trim() || null,
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

    await recordAuditLog(tx, {
      actorUserId: actingUserId,
      action: "update",
      entityType: "expense",
      entityId: expenseId,
      groupId,
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

    await recordAuditLog(tx, {
      actorUserId: actingUserId,
      action: "update",
      entityType: "expense",
      entityId: expenseId,
      groupId,
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
 *
 * Defensa en profundidad (Fase 4): si el gasto todavia existe, se verifica
 * explicitamente que pertenece a `groupId` antes de consultar el
 * historial (en vez de confiar unicamente en el `group_id` grabado en cada
 * fila de `audit_logs`), para que un `expenseId` de otro grupo nunca
 * devuelva datos aunque cambiara la forma de escribir el audit log.
 */
export async function getExpenseHistory(groupId: string, expenseId: string, userId: string) {
  await requireMembership(groupId, userId);

  const [currentExpense] = await db
    .select({ groupId: expenses.groupId })
    .from(expenses)
    .where(eq(expenses.id, expenseId))
    .limit(1);
  if (currentExpense && currentExpense.groupId !== groupId) {
    throw new AppError(404, "Gasto no encontrado", "expense_not_found");
  }

  return db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      actorUserId: auditLogs.actorUserId,
      actorDisplayName: users.displayName,
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
    await recordAuditLog(tx, {
      actorUserId: actingUserId,
      action: "delete",
      entityType: "expense",
      entityId: expenseId,
      groupId,
      beforeData: { expense, shares },
      afterData: null,
    });
    await tx.delete(expenses).where(eq(expenses.id, expenseId));
    return expense;
  });
}
