import { pgTable, uuid, varchar, integer, boolean, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { users } from "./users";
import { groups } from "./groups";

/**
 * Estados del ciclo de vida de un trabajo de importacion (Fase 11). Enum
 * de Postgres porque es una maquina de estados fija y cerrada (a
 * diferencia de `entityType`/`provider`, que son texto libre para poder
 * ampliarse sin migrar el esquema).
 */
export const importJobStatusEnum = pgEnum("import_job_status", [
  "draft",
  "preview",
  "running",
  "completed",
  "partial",
  "failed",
  "cancelled",
]);

/**
 * Trabajo de importacion persistente (Fase 11: Splitwise -> Gatso).
 * Vive en base de datos (no en memoria del navegador) para poder
 * reanudarse tras un fallo, cancelarse cooperativamente y consultar su
 * progreso desde cualquier sesion del mismo usuario.
 *
 * `sourceGroupExternalId` es el id opaco del grupo en el proveedor
 * externo; `targetGroupId` es el grupo Gatso resultante (nuevo o
 * existente, segun `createMode`). `cursor` persiste la posicion de
 * paginacion de `get_expenses` (offset/limit de Splitwise) para poder
 * reanudar sin volver a pedir paginas ya procesadas.
 */
export const importJobs = pgTable("import_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 32 }).notNull(),
  status: importJobStatusEnum("status").notNull().default("draft"),
  sourceGroupExternalId: varchar("source_group_external_id", { length: 64 }).notNull(),
  /** "create" (grupo Gatso nuevo) | "existing" (importar dentro de un grupo ya administrado por el usuario). */
  createMode: varchar("create_mode", { length: 16 }).notNull().default("create"),
  targetGroupId: uuid("target_group_id").references(() => groups.id, { onDelete: "set null" }),
  cursor: varchar("cursor", { length: 256 }),
  totalEstimated: integer("total_estimated"),
  importedCount: integer("imported_count").notNull().default(0),
  updatedCount: integer("updated_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  /** Resumen legible del ultimo fallo global del job (sin datos personales del proveedor). */
  errorSummary: text("error_summary"),
  cancelRequested: boolean("cancel_requested").notNull().default(false),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ImportJob = typeof importJobs.$inferSelect;
export type NewImportJob = typeof importJobs.$inferInsert;
