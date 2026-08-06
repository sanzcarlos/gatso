import { pgTable, uuid, varchar, smallint, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";
import { currencies } from "./currencies";

/**
 * Grupos de gasto compartido. Limite: 64 personas / 32 subgrupos por grupo
 * (Fase 2). Se guarda el limite en la fila para permitir overrides puntuales
 * sin migracion, aunque el valor por defecto se valida en la capa de servicio.
 *
 * `baseCurrencyCode` (Fase 10): moneda de referencia del grupo, usada para
 * mostrar totales agregados cuando hay gastos en varias monedas (ver
 * `src/lib/exchange-rates/service.ts` para la conversion usando el cambio
 * diario del BCE). Por defecto EUR, elegible al crear el grupo.
 */
export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 64 }).notNull(),
  inviteCode: varchar("invite_code", { length: 16 }).notNull().unique(),
  maxMembers: smallint("max_members").notNull().default(64),
  maxSubgroups: smallint("max_subgroups").notNull().default(32),
  baseCurrencyCode: varchar("base_currency_code", { length: 3 })
    .notNull()
    .default("EUR")
    .references(() => currencies.code),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  /**
   * Grupo archivado (Backlog: politica para grupos con cero miembros):
   * cuando el ultimo miembro abandona el grupo, en vez de borrarlo de
   * inmediato se marca aqui la fecha y se invalida su codigo de
   * invitacion (`joinGroupByInviteCode` ignora los grupos archivados),
   * pero se conservan grupo, subgrupos y gastos. Un administrador de
   * plataforma puede restaurarlo desde `/admin/groups` mientras siga
   * archivado; pasado el periodo de retencion (`archived_groups_retention_days`
   * en `app_config`), `cleanupArchivedGroups` lo borra de forma definitiva
   * (eliminacion diferida, ver `src/lib/retention/service.ts`). `NULL`
   * significa que el grupo esta activo (tiene al menos un miembro).
   */
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
