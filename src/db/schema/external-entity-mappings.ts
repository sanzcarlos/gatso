import { pgTable, uuid, varchar, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { importJobs } from "./import-jobs";

/**
 * Correspondencia entre una entidad del proveedor externo y su entidad
 * Gatso equivalente (Fase 11). La restriccion UNICA
 * `(provider, entityType, externalId)` es la clave de la idempotencia de
 * toda la importacion: antes de crear cualquier fila nueva, el servicio
 * consulta esta tabla por el id externo; si ya existe, actualiza (o
 * omite) en vez de duplicar, incluso si el job se relanza o se reanuda
 * tras un fallo.
 *
 * `entityType` es texto libre (no enum) por el mismo motivo que
 * `auditLogs.entityType`: anadir un tipo nuevo (ej. "comment" en una
 * fase futura) no debe requerir una migracion. `gatsoId` no lleva FK
 * porque la tabla a la que apunta depende de `entityType` (group, user,
 * expense, payment); la integridad se garantiza a nivel de servicio.
 *
 * `externalVersion` guarda un hash/version del recurso origen tal como
 * se importo, para decidir en una importacion incremental posterior si
 * el recurso cambio en Splitwise desde la ultima vez (evita reprocesar
 * sin necesidad y detecta ediciones reales que si deben actualizarse).
 */
export const externalEntityMappings = pgTable(
  "external_entity_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: varchar("provider", { length: 32 }).notNull(),
    entityType: varchar("entity_type", { length: 16 }).notNull(),
    externalId: varchar("external_id", { length: 64 }).notNull(),
    gatsoId: uuid("gatso_id").notNull(),
    externalVersion: varchar("external_version", { length: 64 }),
    createdByJobId: uuid("created_by_job_id").references(() => importJobs.id, { onDelete: "set null" }),
    lastImportedAt: timestamp("last_imported_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("external_entity_mappings_provider_type_external_idx").on(
      table.provider,
      table.entityType,
      table.externalId,
    ),
  ],
);

export type ExternalEntityMapping = typeof externalEntityMappings.$inferSelect;
export type NewExternalEntityMapping = typeof externalEntityMappings.$inferInsert;
