import { pgTable, uuid, varchar, boolean, timestamp } from "drizzle-orm/pg-core";
import { importJobs } from "./import-jobs";

/**
 * Errores individuales (por entidad) de un trabajo de importacion (Fase
 * 11). Deliberadamente NO se guarda el payload completo recibido del
 * proveedor (podria contener nombres reales, emails, notas de gasto):
 * solo un mensaje de error acotado y el id externo de la entidad
 * afectada, suficiente para que el usuario entienda que fallo y para
 * decidir si reintentar. `recoverable` distingue errores transitorios
 * (red, 429, 5xx: se puede reintentar sin intervencion) de errores de
 * datos (formato inesperado, moneda no soportada: requieren revision).
 */
export const importJobErrors = pgTable("import_job_errors", {
  id: uuid("id").primaryKey().defaultRandom(),
  importJobId: uuid("import_job_id")
    .notNull()
    .references(() => importJobs.id, { onDelete: "cascade" }),
  entityType: varchar("entity_type", { length: 16 }).notNull(),
  externalId: varchar("external_id", { length: 64 }),
  message: varchar("message", { length: 500 }).notNull(),
  recoverable: boolean("recoverable").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ImportJobError = typeof importJobErrors.$inferSelect;
export type NewImportJobError = typeof importJobErrors.$inferInsert;
