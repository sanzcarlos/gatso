import { and, eq, inArray, desc, count } from "drizzle-orm";
import { db, importJobs, importJobErrors, memberships, groups, groupInvitations, externalEntityMappings } from "@/db";
import type { ImportJob } from "@/db/schema/import-jobs";
import { AppError } from "@/lib/errors";
import { requireGroupAdmin, createGroup } from "@/lib/groups/service";
import { addUserToAllGroupSubgroups } from "@/lib/groups/subgroup-service";
import { createGroupInvitation } from "@/lib/groups/invitation-service";
import { createExpense } from "@/lib/expenses/service";
import { recordSettlementPayment } from "@/lib/settlements/service";
import { recordAuditLog } from "@/lib/audit/service";
import { centsToAmount } from "@/lib/money";
import { getSplitwiseClientForUser } from "./connection-service";
import { fetchSplitwiseExpensesPage } from "./paginate";
import type { SplitwiseClient, SplitwiseExpense, SplitwiseUser } from "./client";
import { extractSplitwiseShares, chooseSplitForSingleExpense, decomposeMultiPayerExpense, sharesToFixedSplit } from "./mapping";
import { displayNameFor } from "./preview-service";
import { SPLITWISE_PROVIDER, getEntityMapping, getEntityMappingsFor, recordEntityMapping } from "./mapping-store";
import { classifySplitwiseExpense, determineFinalJobStatus, type ImportJobCounts } from "./job-status";

/**
 * Orquestador del job de importacion (Fase 11). Decision de arquitectura
 * documentada: Gatso se despliega como funciones serverless (Vercel) sin
 * cola/worker propio; en vez de introducir infraestructura nueva solo
 * para esto, cada llamada a {@link runJobChunk} procesa paginas de
 * `get_expenses` hasta agotar el trabajo pendiente O hasta agotar un
 * presupuesto de tiempo (`CHUNK_TIME_BUDGET_MS`, con margen bajo el
 * limite de las funciones de Vercel), persistiendo el progreso
 * (`import_jobs.cursor`+contadores) tras cada pagina. Si el presupuesto
 * se agota antes de terminar, el job queda en `"running"` con su cursor
 * guardado; `retrySplitwiseImportJob` simplemente vuelve a llamar a
 * `runJobChunk`, que reanuda justo donde lo dejo. Esto cumple el
 * requisito de "reanudable" sin depender de que el navegador permanezca
 * abierto (cada llamada es una peticion HTTP independiente y corta) ni de
 * un servicio de colas externo.
 */

const CHUNK_TIME_BUDGET_MS = 8000;

function describeError(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (error instanceof Error) return `Error inesperado: ${error.message}`.slice(0, 200);
  return "Error desconocido";
}

async function insertJobError(
  jobId: string,
  entityType: string,
  externalId: string | null,
  message: string,
  recoverable: boolean,
): Promise<void> {
  await db.insert(importJobErrors).values({
    importJobId: jobId,
    entityType,
    externalId,
    message: message.slice(0, 500),
    recoverable,
  });
}

/** Nombres de los miembros del grupo de Splitwise origen, para poder sugerir un nombre visible al generar una invitacion automatica. Una sola llamada HTTP por chunk. */
async function fetchSplitwiseMemberNames(client: SplitwiseClient, sourceGroupExternalId: string): Promise<Map<string, string>> {
  try {
    const { group } = await client.getGroup(sourceGroupExternalId);
    return new Map(group.members.map((member: SplitwiseUser) => [String(member.id), displayNameFor(member)]));
  } catch {
    return new Map();
  }
}

/**
 * Nombre a mostrar para un participante externo (mensajes de error,
 * nombre sugerido de la invitacion). `fetchSplitwiseMemberNames` solo
 * conoce a los miembros ACTUALES del grupo en Splitwise (`get_group`):
 * un participante que ya abandono ese grupo en Splitwise pero tiene
 * gastos historicos ahi no aparece en ese mapa, asi que se usa un
 * nombre generico con su id en vez del id crudo pelado.
 */
function resolveParticipantName(externalUserId: string, memberNames: Map<string, string>): string {
  return memberNames.get(externalUserId) ?? `Participante ${externalUserId}`;
}

/**
 * Resuelve un participante de Splitwise sin cuenta Gatso todavia
 * (backlog Fase 11 ampliada: "si no se mapea un usuario de Splitwise a
 * uno de Gatso, se tiene que crear el usuario en Gatso y el
 * administrador del grupo podra ver el enlace de invitacion para poder
 * compartirlo"). En vez de crear una cuenta con contrasena ficticia
 * (descartado explicitamente), genera -de forma idempotente- una
 * invitacion personal vinculada a ese participante externo
 * (`group_invitations.externalParticipantId`): el administrador la ve y
 * la comparte igual que cualquier otra invitacion (`InviteMemberDialog`,
 * ya lista todas las pendientes del grupo). Cuando la acepte,
 * `acceptGroupInvitation` registra la correspondencia real y una
 * importacion posterior del mismo grupo Splitwise resuelve a esa persona
 * automaticamente, sin remapeo manual.
 *
 * Idempotencia: antes de crear, comprueba si ya existe una invitacion
 * pendiente para este participante EN ESTE GRUPO DESTINO concreto
 * (`entityType: "user_invitation"`, clave `${targetGroupId}:${externalUserId}`
 * en `external_entity_mappings`) para no generar un enlace nuevo cada vez
 * que otro gasto referencia al mismo participante sin mapear. La clave
 * incluye el grupo destino (no solo el participante) porque una
 * invitacion pertenece a un grupo concreto (`group_invitations.groupId`):
 * sin esto, importar el mismo grupo de Splitwise dentro de dos grupos
 * Gatso distintos generaria una invitacion para el primero y la
 * reutilizaria (incorrectamente) como si fuera valida para el segundo.
 *
 * Ademas de comprobar que existe una correspondencia, se verifica que la
 * invitacion referenciada SIGA EXISTIENDO y este vigente (no usada, no
 * caducada): si el grupo se borro entretanto (cascade elimina
 * `group_invitations`, pero `external_entity_mappings` no tiene FK al
 * grupo y queda con una referencia colgante) o la invitacion caduco, se
 * descarta la correspondencia obsoleta y se genera una nueva.
 */
async function ensurePendingInvitationForParticipant(
  job: ImportJob,
  externalUserId: string,
  memberNames: Map<string, string>,
): Promise<void> {
  const invitationTrackingKey = `${job.targetGroupId}:${externalUserId}`;
  const existingInvitationMapping = await getEntityMapping("user_invitation", invitationTrackingKey);
  if (existingInvitationMapping) {
    const [invitation] = await db
      .select()
      .from(groupInvitations)
      .where(eq(groupInvitations.id, existingInvitationMapping.gatsoId))
      .limit(1);
    const stillPending = Boolean(invitation) && !invitation!.usedAt && invitation!.expiresAt.getTime() > Date.now();
    if (stillPending) return;
    await db.delete(externalEntityMappings).where(eq(externalEntityMappings.id, existingInvitationMapping.id));
  }

  const displayName = resolveParticipantName(externalUserId, memberNames);
  const invitation = await createGroupInvitation(job.targetGroupId!, job.userId, {
    suggestedDisplayName: displayName.slice(0, 64),
    externalProvider: SPLITWISE_PROVIDER,
    externalParticipantId: externalUserId,
  });
  await recordEntityMapping("user_invitation", invitationTrackingKey, invitation.id, job.id);
}

/**
 * Anade como miembros del grupo destino a los usuarios Gatso mapeados que
 * todavia no lo sean (Fase 11: el desplegable de mapeo ofrece cualquier
 * usuario que el importador conozca de otro de sus grupos, no solo los
 * miembros actuales del grupo destino, para no obligar a invitar primero
 * a alguien con quien ya se comparte grupo en otro sitio). Se hace como
 * parte de la misma accion explicita y autenticada de confirmar la
 * importacion (el usuario ya debe ser administrador del grupo destino,
 * comprobado antes de llamar a esta funcion): no es una alta silenciosa
 * en segundo plano.
 *
 * Los participantes de Splitwise SIN cuenta Gatso (no aparecen en el
 * mapeo porque no se ha seleccionado ningun usuario para ellos) siguen
 * sin poder anadirse aqui por diseno (backlog: "no se crearan cuentas
 * con contrasenas ficticias"); en vez de eso, `processSplitwiseExpense`
 * les genera automaticamente una invitacion pendiente
 * (`ensurePendingInvitationForParticipant`) al encontrarlos en un gasto,
 * para que el administrador solo tenga que compartir el enlace.
 */
async function ensureGroupMembers(groupId: string, actingUserId: string, gatsoUserIds: string[], importJobId: string): Promise<void> {
  if (gatsoUserIds.length === 0) return;

  await db.transaction(async (tx) => {
    const [group] = await tx.select().from(groups).where(eq(groups.id, groupId)).for("update").limit(1);
    if (!group) throw new AppError(404, "Grupo no encontrado", "group_not_found");

    const memberRows = await tx
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(and(eq(memberships.groupId, groupId), inArray(memberships.userId, gatsoUserIds)));
    const existingIds = new Set(memberRows.map((m) => m.userId));
    const missingIds = gatsoUserIds.filter((id) => !existingIds.has(id));
    if (missingIds.length === 0) return;

    const [memberCountRow] = await tx.select({ value: count() }).from(memberships).where(eq(memberships.groupId, groupId));
    const currentCount = memberCountRow?.value ?? 0;
    if (currentCount + missingIds.length > group.maxMembers) {
      throw new AppError(
        409,
        `Anadir a los participantes mapeados superaria el limite de ${group.maxMembers} miembros del grupo`,
        "group_full",
      );
    }

    for (const userId of missingIds) {
      const [membership] = await tx.insert(memberships).values({ groupId, userId, role: "member" }).returning();
      await addUserToAllGroupSubgroups(tx, groupId, userId);
      if (membership) {
        await recordAuditLog(tx, {
          actorUserId: actingUserId,
          action: "create",
          entityType: "membership",
          entityId: membership.id,
          groupId,
          afterData: { ...membership, addedViaSplitwiseImport: true, importJobId },
        });
      }
    }
  });
}

export interface ParticipantMappingInput {
  externalId: string;
  gatsoUserId: string;
}

export interface CreateSplitwiseImportJobInput {
  sourceGroupExternalId: string;
  sourceGroupName: string;
  createMode: "create" | "existing";
  targetGroupId?: string | undefined;
  targetGroupName?: string | undefined;
  baseCurrencyCode?: string | undefined;
  participantMappings: ParticipantMappingInput[];
}

/**
 * Crea el trabajo de importacion (backlog: "confirmacion y creacion del
 * job"). Valida el modo de destino (crear grupo nuevo o importar en uno
 * existente administrado por el usuario, "la segunda opcion exige rol de
 * administrador"); los usuarios Gatso mapeados que aun no sean miembros
 * del grupo destino se anaden automaticamente (`ensureGroupMembers`)
 * antes de procesar el primer lote de gastos de forma sincrona.
 */
export async function createSplitwiseImportJob(actingUserId: string, input: CreateSplitwiseImportJobInput): Promise<ImportJob> {
  let targetGroupId: string;

  if (input.createMode === "existing") {
    if (!input.targetGroupId) {
      throw new AppError(400, "Falta el grupo Gatso donde importar", "missing_target_group");
    }
    await requireGroupAdmin(input.targetGroupId, actingUserId);
    targetGroupId = input.targetGroupId;
  } else {
    const group = await createGroup(
      actingUserId,
      input.targetGroupName?.trim() || input.sourceGroupName,
      input.baseCurrencyCode ?? "EUR",
    );
    targetGroupId = group.id;
  }

  const [job] = await db
    .insert(importJobs)
    .values({
      userId: actingUserId,
      provider: "splitwise",
      status: "draft",
      sourceGroupExternalId: input.sourceGroupExternalId,
      createMode: input.createMode,
      targetGroupId,
    })
    .returning();
  if (!job) throw new AppError(500, "No se pudo crear el trabajo de importacion");

  const gatsoUserIds = [...new Set(input.participantMappings.map((m) => m.gatsoUserId))];
  await ensureGroupMembers(targetGroupId, actingUserId, gatsoUserIds, job.id);

  await recordEntityMapping("group", input.sourceGroupExternalId, targetGroupId, job.id);
  for (const mapping of input.participantMappings) {
    await recordEntityMapping("user", mapping.externalId, mapping.gatsoUserId, job.id);
  }

  await recordAuditLog(db, {
    actorUserId: actingUserId,
    action: "create",
    entityType: "import_job",
    entityId: job.id,
    groupId: targetGroupId,
    afterData: { provider: "splitwise", sourceGroupExternalId: input.sourceGroupExternalId, createMode: input.createMode },
  });

  return runJobChunk(job.id);
}

interface ExpenseProcessResult {
  imported: number;
  skipped: number;
  failed: number;
}

async function processSingleExpense(job: ImportJob, expense: SplitwiseExpense, memberNames: Map<string, string>): Promise<ExpenseProcessResult> {
  const { payers, participants } = extractSplitwiseShares(expense);
  if (payers.length === 0 || participants.length === 0) {
    await insertJobError(job.id, "expense", String(expense.id), "Gasto sin pagador o sin participantes validos", false);
    return { imported: 0, skipped: 0, failed: 1 };
  }

  const externalIdsInvolved = [...new Set([...payers.map((p) => p.userId), ...participants.map((p) => p.userId)])];
  const userMap = await getEntityMappingsFor("user", externalIdsInvolved);
  const missing = externalIdsInvolved.filter((id) => !userMap.has(id));
  if (missing.length > 0) {
    const names = missing.map((id) => resolveParticipantName(id, memberNames));
    for (const id of missing) {
      await ensurePendingInvitationForParticipant(job, id, memberNames).catch(() => {
        // No bloquea el registro del error si generar la invitacion falla (ej. rate limit); se reintentara en una proxima ejecucion.
      });
    }
    await insertJobError(
      job.id,
      "expense",
      String(expense.id),
      `Participantes de Splitwise sin cuenta Gatso todavia: ${names.join(", ")}. Se ha generado (o ya existia) una invitacion pendiente para cada uno; el administrador puede compartirla desde "Invitar" en el grupo.`,
      true,
    );
    return { imported: 0, skipped: 0, failed: 1 };
  }

  const description = expense.description?.trim() || "Gasto importado de Splitwise";
  const expenseDate = expense.date.slice(0, 10);
  /**
   * Backlog: "importar los gastos con comentarios [...] definir un campo
   * comentario en la parte de gastos o se omite el comentario de
   * Splitwise". Se elige la primera opcion: `expenses.notes` (Gatso)
   * recibe el campo `details` de Splitwise (las notas que la persona
   * escribio al crear el gasto alli, ya presentes en la respuesta de
   * `get_expenses` sin llamadas adicionales). Los comentarios de
   * discusion reales (hilo de `comments`, contados en la vista previa
   * como `unsupportedDataCounts.withComments`) siguen sin importarse:
   * requeririan una llamada HTTP extra por gasto a la API de Splitwise,
   * coste que no se considera justificado frente al beneficio.
   */
  const notes = expense.details?.trim() || undefined;

  if (payers.length === 1) {
    const mappingKey = String(expense.id);
    if (await getEntityMapping("expense", mappingKey)) {
      return { imported: 0, skipped: 1, failed: 0 };
    }

    const totalCents = payers[0]!.cents;
    const mappedParticipants = participants.map((p) => ({ userId: userMap.get(p.userId)!, cents: p.cents }));
    const split = chooseSplitForSingleExpense(totalCents, mappedParticipants);

    try {
      const created = await createExpense(
        job.targetGroupId!,
        job.userId,
        {
          payerId: userMap.get(payers[0]!.userId)!,
          amount: centsToAmount(totalCents),
          currencyCode: expense.currency_code,
          description,
          notes,
          expenseDate,
          split,
        },
        { skipRateLimit: true },
      );
      await recordEntityMapping("expense", mappingKey, created.id, job.id);
      return { imported: 1, skipped: 0, failed: 0 };
    } catch (error) {
      await insertJobError(job.id, "expense", mappingKey, describeError(error), true);
      return { imported: 0, skipped: 0, failed: 1 };
    }
  }

  // Varios pagadores: decision documentada en mapping.ts (decomposeMultiPayerExpense).
  let subExpenses;
  try {
    const mappedPayers = payers.map((p) => ({ userId: userMap.get(p.userId)!, cents: p.cents }));
    const mappedParticipants = participants.map((p) => ({ userId: userMap.get(p.userId)!, cents: p.cents }));
    subExpenses = decomposeMultiPayerExpense(mappedPayers, mappedParticipants);
  } catch (error) {
    await insertJobError(job.id, "expense", String(expense.id), describeError(error), false);
    return { imported: 0, skipped: 0, failed: 1 };
  }

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  for (const sub of subExpenses) {
    const legKey = `${expense.id}:${sub.payerId}`;
    if (await getEntityMapping("expense", legKey)) {
      skipped++;
      continue;
    }
    try {
      const created = await createExpense(
        job.targetGroupId!,
        job.userId,
        {
          payerId: sub.payerId,
          amount: centsToAmount(sub.amountCents),
          currencyCode: expense.currency_code,
          description: `${description} (parte pagada por este usuario)`,
          notes,
          expenseDate,
          split: sharesToFixedSplit(sub.shares),
        },
        { skipRateLimit: true },
      );
      await recordEntityMapping("expense", legKey, created.id, job.id);
      imported++;
    } catch (error) {
      await insertJobError(job.id, "expense", legKey, describeError(error), true);
      failed++;
    }
  }
  return { imported, skipped, failed };
}

async function processSettlementPayment(job: ImportJob, expense: SplitwiseExpense, memberNames: Map<string, string>): Promise<ExpenseProcessResult> {
  const { payers, participants } = extractSplitwiseShares(expense);
  if (payers.length !== 1 || participants.length !== 1 || payers[0]!.userId === participants[0]!.userId) {
    await insertJobError(job.id, "payment", String(expense.id), "Forma de pago no soportada (varios pagadores/receptores)", false);
    return { imported: 0, skipped: 1, failed: 0 };
  }

  const mappingKey = String(expense.id);
  if (await getEntityMapping("payment", mappingKey)) {
    return { imported: 0, skipped: 1, failed: 0 };
  }

  const fromExternalId = payers[0]!.userId;
  const toExternalId = participants[0]!.userId;
  const userMap = await getEntityMappingsFor("user", [fromExternalId, toExternalId]);
  if (!userMap.has(fromExternalId) || !userMap.has(toExternalId)) {
    const missing = [fromExternalId, toExternalId].filter((id) => !userMap.has(id));
    const names = missing.map((id) => resolveParticipantName(id, memberNames));
    for (const id of missing) {
      await ensurePendingInvitationForParticipant(job, id, memberNames).catch(() => {
        // Ver comentario equivalente en processSingleExpense.
      });
    }
    await insertJobError(
      job.id,
      "payment",
      mappingKey,
      `Participantes del pago sin cuenta Gatso todavia: ${names.join(", ")}. Se ha generado (o ya existia) una invitacion pendiente para cada uno.`,
      true,
    );
    return { imported: 0, skipped: 0, failed: 1 };
  }

  try {
    const created = await recordSettlementPayment(job.targetGroupId!, job.userId, {
      fromUserId: userMap.get(fromExternalId)!,
      toUserId: userMap.get(toExternalId)!,
      amountCents: payers[0]!.cents,
      currencyCode: expense.currency_code,
      method: "transfer",
    });
    await recordEntityMapping("payment", mappingKey, created.id, job.id);
    return { imported: 1, skipped: 0, failed: 0 };
  } catch (error) {
    await insertJobError(job.id, "payment", mappingKey, describeError(error), true);
    return { imported: 0, skipped: 0, failed: 1 };
  }
}

async function processSplitwiseExpense(job: ImportJob, expense: SplitwiseExpense, memberNames: Map<string, string>): Promise<ExpenseProcessResult> {
  const classification = classifySplitwiseExpense(expense);
  if (classification === "deleted") return { imported: 0, skipped: 1, failed: 0 };
  if (classification === "settlement_payment") return processSettlementPayment(job, expense, memberNames);
  return processSingleExpense(job, expense, memberNames);
}

async function persistProgress(jobId: string, cursor: number, counts: ImportJobCounts): Promise<void> {
  await db
    .update(importJobs)
    .set({ cursor: String(cursor), ...counts, updatedAt: new Date() })
    .where(eq(importJobs.id, jobId));
}

async function finishJob(
  jobId: string,
  status: "completed" | "partial" | "failed" | "cancelled",
  cursor: number,
  counts: ImportJobCounts,
  errorSummary: string | null,
): Promise<ImportJob> {
  const [updated] = await db
    .update(importJobs)
    .set({ status, cursor: String(cursor), ...counts, errorSummary, finishedAt: new Date(), updatedAt: new Date() })
    .where(eq(importJobs.id, jobId))
    .returning();
  if (!updated) throw new AppError(404, "Trabajo de importacion no encontrado", "import_job_not_found");
  return updated;
}

/**
 * Procesa el trabajo hasta agotar el trabajo pendiente o el presupuesto
 * de tiempo de este chunk (ver comentario de cabecera del archivo).
 * Idempotente: llamarla sobre un job ya `completed`/`cancelled` no hace
 * nada.
 */
export async function runJobChunk(jobId: string): Promise<ImportJob> {
  const [job] = await db.select().from(importJobs).where(eq(importJobs.id, jobId)).limit(1);
  if (!job) throw new AppError(404, "Trabajo de importacion no encontrado", "import_job_not_found");
  if (job.status === "completed" || job.status === "cancelled") return job;
  if (!job.targetGroupId) {
    // `targetGroupId` solo llega a NULL via ON DELETE SET NULL: el grupo
    // destino se borro despues de crear el job (ej. su ultimo miembro lo
    // abandono, ver `leaveGroup`). El job queda irrecuperable; hay que
    // iniciar una importacion nueva contra un grupo que exista.
    return finishJob(
      jobId,
      "failed",
      0,
      { importedCount: 0, skippedCount: 0, failedCount: 0 },
      "El grupo destino de esta importacion ya no existe (fue borrado). Inicia una importacion nueva.",
    );
  }

  await db
    .update(importJobs)
    .set({ status: "running", startedAt: job.startedAt ?? new Date(), updatedAt: new Date() })
    .where(eq(importJobs.id, jobId));

  let client: SplitwiseClient;
  try {
    client = await getSplitwiseClientForUser(job.userId);
  } catch (error) {
    return finishJob(
      jobId,
      "failed",
      job.cursor ? Number(job.cursor) : 0,
      { importedCount: job.importedCount, skippedCount: job.skippedCount, failedCount: job.failedCount },
      describeError(error),
    );
  }

  const deadline = Date.now() + CHUNK_TIME_BUDGET_MS;
  let offset = job.cursor ? Number(job.cursor) : 0;
  let importedCount = job.importedCount;
  let skippedCount = job.skippedCount;
  let failedCount = job.failedCount;
  const memberNames = await fetchSplitwiseMemberNames(client, job.sourceGroupExternalId);

  try {
    while (true) {
      const [cancelRow] = await db
        .select({ cancelRequested: importJobs.cancelRequested })
        .from(importJobs)
        .where(eq(importJobs.id, jobId))
        .limit(1);
      if (cancelRow?.cancelRequested) {
        return finishJob(jobId, "cancelled", offset, { importedCount, skippedCount, failedCount }, null);
      }

      const page = await fetchSplitwiseExpensesPage(client, job.sourceGroupExternalId, offset);
      for (const expense of page.expenses) {
        const result = await processSplitwiseExpense(job, expense, memberNames);
        importedCount += result.imported;
        skippedCount += result.skipped;
        failedCount += result.failed;
      }
      offset = page.nextOffset;
      await persistProgress(jobId, offset, { importedCount, skippedCount, failedCount });

      if (!page.hasMore) {
        const finalStatus = determineFinalJobStatus({ importedCount, skippedCount, failedCount });
        return finishJob(jobId, finalStatus, offset, { importedCount, skippedCount, failedCount }, null);
      }
      if (Date.now() > deadline) {
        const [current] = await db.select().from(importJobs).where(eq(importJobs.id, jobId)).limit(1);
        return current!;
      }
    }
  } catch (error) {
    const status = importedCount > 0 || skippedCount > 0 ? "partial" : "failed";
    return finishJob(jobId, status, offset, { importedCount, skippedCount, failedCount }, describeError(error));
  }
}

export async function getSplitwiseImportJob(userId: string, jobId: string) {
  const [job] = await db.select().from(importJobs).where(and(eq(importJobs.id, jobId), eq(importJobs.userId, userId))).limit(1);
  if (!job) throw new AppError(404, "Trabajo de importacion no encontrado", "import_job_not_found");

  const errors = await db
    .select()
    .from(importJobErrors)
    .where(eq(importJobErrors.importJobId, jobId))
    .orderBy(desc(importJobErrors.createdAt))
    .limit(50);

  return { job, errors };
}

export async function listSplitwiseImportJobs(userId: string) {
  return db
    .select({ job: importJobs, targetGroupName: groups.name })
    .from(importJobs)
    .leftJoin(groups, eq(groups.id, importJobs.targetGroupId))
    .where(eq(importJobs.userId, userId))
    .orderBy(desc(importJobs.createdAt));
}

export async function cancelSplitwiseImportJob(userId: string, jobId: string): Promise<ImportJob> {
  const [job] = await db.select().from(importJobs).where(and(eq(importJobs.id, jobId), eq(importJobs.userId, userId))).limit(1);
  if (!job) throw new AppError(404, "Trabajo de importacion no encontrado", "import_job_not_found");
  if (job.status === "completed" || job.status === "cancelled" || job.status === "failed") {
    throw new AppError(409, "Este trabajo ya ha terminado, no se puede cancelar", "import_job_already_finished");
  }

  const [updated] = await db.update(importJobs).set({ cancelRequested: true, updatedAt: new Date() }).where(eq(importJobs.id, jobId)).returning();
  return updated!;
}

/**
 * Reanuda un job que se quedo `"running"` (agoto el presupuesto de
 * tiempo de un chunk) o corrigelo tras un fallo (`"partial"`/`"failed"`).
 * Un job `"cancelled"` es una decision deliberada del usuario y no se
 * reanuda con este mismo endpoint: hay que crear una importacion nueva.
 */
export async function retrySplitwiseImportJob(userId: string, jobId: string): Promise<ImportJob> {
  const [job] = await db.select().from(importJobs).where(and(eq(importJobs.id, jobId), eq(importJobs.userId, userId))).limit(1);
  if (!job) throw new AppError(404, "Trabajo de importacion no encontrado", "import_job_not_found");
  if (job.status === "completed") {
    throw new AppError(409, "Este trabajo ya se completo", "import_job_already_completed");
  }
  if (job.status === "cancelled") {
    throw new AppError(409, "Este trabajo fue cancelado; crea una importacion nueva si quieres reintentarlo", "import_job_cancelled");
  }
  return runJobChunk(jobId);
}
