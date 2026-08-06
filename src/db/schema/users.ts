import { pgTable, uuid, varchar, boolean, timestamp } from "drizzle-orm/pg-core";

/**
 * Usuarios de la aplicacion.
 *
 * Diseno "minima informacion posible": sin nombre real obligatorio, sin
 * email, sin almacenamiento de IP. El hash de contrasena usa Argon2id
 * (ver src/lib/auth/password.ts en Fase 1).
 *
 * Identidad dividida en dos campos con proposito distinto (antes un solo
 * `alias` hacia ambas funciones a la vez):
 * - `id` (uuid): identificador unico interno, inmutable, generado por la
 *   aplicacion al crear la cuenta. Es la clave real usada en toda FK del
 *   esquema (memberships, expenses, audit_logs...); nunca se muestra en
 *   la interfaz.
 * - `username`: credencial de acceso (login/registro/recuperacion),
 *   unica, con el mismo patron restringido de siempre
 *   (`[a-zA-Z0-9_-]{3,32}`). No hay flujo de "cambiar username": es
 *   estable para no romper el habito de inicio de sesion ni la
 *   identificacion en auditoria/rate-limiting por credencial.
 * - `displayName`: nombre visible en toda la aplicacion (listados de
 *   miembros, gastos, liquidaciones, auditoria...). Editable por el
 *   propio usuario en cualquier momento (`PATCH /api/users/[userId]`),
 *   sin restriccion de unicidad ni de patron estricto (solo longitud).
 *   Se inicializa igual al `username` al crear la cuenta.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: varchar("username", { length: 32 }).notNull().unique(),
  displayName: varchar("display_name", { length: 64 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  recoveryCodeHash: varchar("recovery_code_hash", { length: 255 }),
  /** Participante importado que aun debe reclamar su cuenta mediante una invitacion. */
  isProvisional: boolean("is_provisional").notNull().default(false),
  /**
   * Administrador de plataforma (Fase 6): distinto del rol "admin" de
   * `memberships` (que es por grupo). Gestiona catalogos globales como
   * monedas, otros administradores de plataforma y la auditoria global
   * desde `/admin` (`setPlatformAdmin` en `src/lib/users/service.ts`). El
   * primer administrador sigue activandose con un UPDATE manual en base
   * de datos (mismo patron que ajustar limites via `app_config`); a
   * partir de ahi, un administrador puede conceder o revocar el rol a
   * cualquier otra cuenta, pero nunca a si mismo ni al ultimo
   * administrador restante, para que la plataforma nunca se quede sin
   * nadie con este rol.
   */
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
