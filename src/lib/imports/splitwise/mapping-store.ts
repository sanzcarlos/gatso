import { and, eq, inArray } from "drizzle-orm";
import { db, externalEntityMappings } from "@/db";
import type { Tx } from "@/db";

/**
 * Acceso a `external_entity_mappings` (Fase 11): la clave de la
 * idempotencia de toda la importacion. Antes de crear cualquier entidad
 * Gatso a partir de un recurso de Splitwise, el servicio consulta esta
 * tabla por su id externo; si ya existe, la omite en vez de duplicarla,
 * incluso si el job se relanza o reanuda tras un fallo.
 */

export const SPLITWISE_PROVIDER = "splitwise";

/**
 * "user_invitation" (Fase 11 ampliada): marca que ya se genero una
 * invitacion personal pendiente para un participante de Splitwise sin
 * cuenta Gatso todavia (backlog: "el administrador del grupo podra ver
 * el enlace de invitacion para poder compartirlo"). `gatsoId` en este
 * caso es el id de la fila de `group_invitations`, no un usuario real
 * (todavia no existe). Se consulta antes de generar una invitacion nueva
 * para no duplicar enlaces si varios gastos referencian al mismo
 * participante sin mapear. Distinto de "user" (mapeo real ya resuelto,
 * `gatsoId` = id de un usuario existente).
 */
export type ImportEntityType = "group" | "user" | "user_invitation" | "expense" | "payment";

export async function getEntityMapping(entityType: ImportEntityType, externalId: string, client: Tx | typeof db = db) {
  const [row] = await client
    .select()
    .from(externalEntityMappings)
    .where(
      and(
        eq(externalEntityMappings.provider, SPLITWISE_PROVIDER),
        eq(externalEntityMappings.entityType, entityType),
        eq(externalEntityMappings.externalId, externalId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getEntityMappingsFor(
  entityType: ImportEntityType,
  externalIds: string[],
  client: Tx | typeof db = db,
): Promise<Map<string, string>> {
  if (externalIds.length === 0) return new Map();
  const rows = await client
    .select({ externalId: externalEntityMappings.externalId, gatsoId: externalEntityMappings.gatsoId })
    .from(externalEntityMappings)
    .where(
      and(
        eq(externalEntityMappings.provider, SPLITWISE_PROVIDER),
        eq(externalEntityMappings.entityType, entityType),
        inArray(externalEntityMappings.externalId, externalIds),
      ),
    );
  return new Map(rows.map((row) => [row.externalId, row.gatsoId]));
}

/** Crea la correspondencia. `onConflictDoNothing`: si ya existe (ej. de un job incremental anterior), se conserva la version ya guardada en vez de sobreescribirla. */
export async function recordEntityMapping(
  entityType: ImportEntityType,
  externalId: string,
  gatsoId: string,
  createdByJobId: string | null,
  client: Tx | typeof db = db,
): Promise<void> {
  await client
    .insert(externalEntityMappings)
    .values({ provider: SPLITWISE_PROVIDER, entityType, externalId, gatsoId, createdByJobId })
    .onConflictDoNothing();
}
