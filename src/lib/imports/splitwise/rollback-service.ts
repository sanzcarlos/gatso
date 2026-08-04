import { and, eq } from "drizzle-orm";
import { db, importJobs, externalEntityMappings, expenses, settlementPayments } from "@/db";
import { AppError } from "@/lib/errors";
import { recordAuditLog } from "@/lib/audit/service";

export interface RollbackReport {
  deletedExpenses: number;
  deletedPayments: number;
  /** Entidades que ya se habian editado en Gatso despues de importarse: no se tocan (backlog: "solo si no fueron modificadas despues"). */
  protectedCount: number;
}

/**
 * Revierte un job: borra UNICAMENTE las entidades que creo ESE job
 * concreto (via `external_entity_mappings.createdByJobId`), y solo si no
 * se han modificado desde entonces en Gatso (backlog Fase 11: "eliminar
 * solo entidades creadas por ese job y solo si no fueron modificadas
 * despues [...] Debe ser idempotente y auditado"). Idempotente: si ya no
 * queda ninguna correspondencia de este job (por una llamada anterior),
 * no hace nada.
 *
 * Deteccion de "no modificado": `expenses.updatedAt` se fija
 * explicitamente en cada `UPDATE` real (`updateExpense`/
 * `validateExpense`); en el `INSERT` inicial, `createdAt`/`updatedAt`
 * usan `defaultNow()` sobre la misma transaccion, por lo que coinciden
 * exactamente. Si difieren, el gasto se ha editado despues de importarse
 * y se protege de la reversion. `settlement_payments` no tiene columna
 * `updatedAt` (no son editables una vez creados), asi que siempre son
 * seguros de revertir.
 */
export async function rollbackSplitwiseImportJob(userId: string, jobId: string): Promise<RollbackReport> {
  const [job] = await db.select().from(importJobs).where(and(eq(importJobs.id, jobId), eq(importJobs.userId, userId))).limit(1);
  if (!job) throw new AppError(404, "Trabajo de importacion no encontrado", "import_job_not_found");
  if (job.status === "running") {
    throw new AppError(409, "Cancela el trabajo antes de revertirlo", "import_job_still_running");
  }

  const mappings = await db.select().from(externalEntityMappings).where(eq(externalEntityMappings.createdByJobId, jobId));

  let deletedExpenses = 0;
  let deletedPayments = 0;
  let protectedCount = 0;

  for (const mapping of mappings) {
    if (mapping.entityType === "expense") {
      const [expense] = await db.select().from(expenses).where(eq(expenses.id, mapping.gatsoId)).limit(1);
      if (!expense) continue;
      if (expense.updatedAt.getTime() !== expense.createdAt.getTime()) {
        protectedCount++;
        continue;
      }
      await db.delete(expenses).where(eq(expenses.id, expense.id));
      await recordAuditLog(db, {
        actorUserId: userId,
        action: "delete",
        entityType: "expense",
        entityId: expense.id,
        groupId: job.targetGroupId,
        beforeData: expense,
        afterData: { rolledBackFromImportJob: jobId },
      });
      deletedExpenses++;
    } else if (mapping.entityType === "payment") {
      const [payment] = await db.select().from(settlementPayments).where(eq(settlementPayments.id, mapping.gatsoId)).limit(1);
      if (!payment) continue;
      await db.delete(settlementPayments).where(eq(settlementPayments.id, payment.id));
      await recordAuditLog(db, {
        actorUserId: userId,
        action: "delete",
        entityType: "settlement_payment",
        entityId: payment.id,
        groupId: job.targetGroupId,
        beforeData: payment,
        afterData: { rolledBackFromImportJob: jobId },
      });
      deletedPayments++;
    } else {
      continue;
    }
    await db.delete(externalEntityMappings).where(eq(externalEntityMappings.id, mapping.id));
  }

  await recordAuditLog(db, {
    actorUserId: userId,
    action: "update",
    entityType: "import_job",
    entityId: jobId,
    groupId: job.targetGroupId,
    afterData: { rolledBack: true, deletedExpenses, deletedPayments, protectedCount },
  });

  return { deletedExpenses, deletedPayments, protectedCount };
}
