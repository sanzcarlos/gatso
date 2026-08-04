import { desc, eq, isNull } from "drizzle-orm";
import { db, auditLogs, users } from "@/db";
import type { Tx } from "@/db";
import { requireGroupAdmin } from "@/lib/groups/service";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";

/**
 * Tipos de entidad auditada (Fase 5). `entityType` es un `varchar(32)` en
 * el esquema (no un enum de Postgres) precisamente para poder anadir
 * nuevos tipos sin migrar el esquema; esta union solo documenta los
 * valores usados hoy por el codigo TypeScript.
 */
export type AuditEntityType =
  | "expense"
  | "group"
  | "subgroup"
  | "membership"
  | "subgroup_membership"
  | "currency"
  | "settlement_payment";

export type AuditAction = "create" | "update" | "delete";

export interface RecordAuditLogParams {
  actorUserId: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  groupId?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
}

/**
 * Registra una entrada en el log de auditoria inmutable (Fase 5: la tabla
 * `audit_logs` tiene un trigger SQL que rechaza cualquier UPDATE/DELETE,
 * ver migracion `drizzle/0003_*`). Debe llamarse siempre dentro de la
 * misma transaccion (`tx`) que la operacion que se esta auditando, para
 * que ambas se confirmen o se deshagan juntas.
 */
export async function recordAuditLog(client: Tx | typeof db, params: RecordAuditLogParams): Promise<void> {
  await client.insert(auditLogs).values({
    actorUserId: params.actorUserId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    groupId: params.groupId ?? null,
    beforeData: params.beforeData ?? null,
    afterData: params.afterData ?? null,
  });
}

/**
 * Historial de auditoria de un grupo completo (todas las entidades:
 * gastos, grupo, subgrupos, membresias). Restringido a administradores
 * del grupo: es informacion sensible sobre quien ha hecho que, no un
 * historial de cara a cualquier miembro (a diferencia del historial de un
 * gasto concreto, que si es visible para cualquier miembro en
 * `getExpenseHistory`).
 */
export async function getGroupAuditLog(groupId: string, actingUserId: string, limit = 100) {
  await requireGroupAdmin(groupId, actingUserId);

  return db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      actorUserId: auditLogs.actorUserId,
      actorAlias: users.alias,
      beforeData: auditLogs.beforeData,
      afterData: auditLogs.afterData,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .innerJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(eq(auditLogs.groupId, groupId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

/**
 * Historial de auditoria de entidades sin `groupId` (Fase 6: catalogo de
 * monedas). Restringido a administradores de plataforma.
 */
export async function getPlatformAuditLog(actingUserId: string, limit = 100) {
  await requirePlatformAdmin(actingUserId);

  return db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      actorUserId: auditLogs.actorUserId,
      actorAlias: users.alias,
      beforeData: auditLogs.beforeData,
      afterData: auditLogs.afterData,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .innerJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(isNull(auditLogs.groupId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}
