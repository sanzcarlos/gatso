import { db, importJobs } from "@/db";
import { eq, and } from "drizzle-orm";
import { AppError } from "@/lib/errors";
import { getGroupSettlement } from "@/lib/settlements/service";
import { getSplitwiseClientForUser } from "./connection-service";
import { fetchAllSplitwiseExpenses } from "./paginate";
import { getEntityMappingsFor } from "./mapping-store";
import { buildSplitwiseNetBalances, translateBalanceKeys, diffBalances, type ReconciliationDiscrepancy } from "./reconciliation";

export interface ReconciliationReport {
  matches: boolean;
  checkedUserCount: number;
  discrepancies: ReconciliationDiscrepancy[];
  truncated: boolean;
}

/**
 * Reconciliacion post-importacion (backlog Fase 11: "Tras importar,
 * recalcular y no marcar completed si existe una diferencia distinta de
 * cero [...] El informe indicara grupo, moneda y participante"). Compara
 * el balance neto que Splitwise calcula para cada participante mapeado
 * (`net_balance`, ya agregado por Splitwise sobre TODO el grupo, no solo
 * lo que trajo este job) contra el balance que Gatso calcula para esos
 * mismos usuarios en el grupo destino (reutilizando
 * `getGroupSettlement`, la misma logica que ve el usuario en la pantalla
 * de liquidacion).
 *
 * Decision de alcance v1: compara el grupo completo, no solo las
 * entidades creadas por este job concreto -- correcto para una
 * importacion unica (el caso de uso principal); si en el futuro se
 * anaden importaciones incrementales reales, esta funcion seguira siendo
 * valida (el grupo completo sigue siendo la fuente de verdad a
 * reconciliar).
 */
export async function reconcileSplitwiseImport(userId: string, jobId: string): Promise<ReconciliationReport> {
  const [job] = await db.select().from(importJobs).where(and(eq(importJobs.id, jobId), eq(importJobs.userId, userId))).limit(1);
  if (!job) throw new AppError(404, "Trabajo de importacion no encontrado", "import_job_not_found");
  if (!job.targetGroupId) {
    throw new AppError(409, "El trabajo no tiene grupo destino asignado", "import_job_missing_target_group");
  }

  const client = await getSplitwiseClientForUser(userId);
  const { expenses, truncated } = await fetchAllSplitwiseExpenses(client, job.sourceGroupExternalId);

  const splitwiseBalances = buildSplitwiseNetBalances(expenses);
  const externalUserIds = [...new Set(expenses.flatMap((expense) => expense.users.map((share) => String(share.user_id))))];
  const userMap = await getEntityMappingsFor("user", externalUserIds);
  const translatedSplitwiseBalances = translateBalanceKeys(splitwiseBalances, userMap);

  const { settlements } = await getGroupSettlement(job.targetGroupId, userId);
  const gatsoBalances = new Map<string, number>();
  for (const settlement of settlements) {
    for (const balance of settlement.balances) {
      gatsoBalances.set(`${settlement.currencyCode}:${balance.userId}`, balance.netCents);
    }
  }

  const discrepancies = diffBalances(translatedSplitwiseBalances, gatsoBalances);

  return {
    matches: discrepancies.length === 0,
    checkedUserCount: userMap.size,
    discrepancies,
    truncated,
  };
}
