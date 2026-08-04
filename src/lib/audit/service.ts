import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { db, auditLogs, users } from "@/db";
import type { Tx } from "@/db";
import { requireGroupAdmin } from "@/lib/groups/service";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { DEFAULT_PAGE_LIMIT, clampLimit, decodeCursor, encodeCursor, type Page } from "@/lib/pagination";

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
  | "settlement_payment"
  | "external_connection"
  | "import_job";

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

export interface AuditLogCursor {
  createdAt: string;
  id: string;
}

export interface AuditLogFilters {
  action?: AuditAction | undefined;
  entityType?: string | undefined;
  cursor?: string | null | undefined;
  limit?: number | undefined;
}

function buildAuditLogCursorCondition(cursor: AuditLogCursor | null) {
  return cursor
    ? or(
        lt(auditLogs.createdAt, new Date(cursor.createdAt)),
        and(eq(auditLogs.createdAt, new Date(cursor.createdAt)), lt(auditLogs.id, cursor.id)),
      )
    : undefined;
}

/**
 * Historial de auditoria de un grupo completo (todas las entidades:
 * gastos, grupo, subgrupos, membresias). Restringido a administradores
 * del grupo: es informacion sensible sobre quien ha hecho que, no un
 * historial de cara a cualquier miembro (a diferencia del historial de un
 * gasto concreto, que si es visible para cualquier miembro en
 * `getExpenseHistory`).
 *
 * Paginado por cursor (createdAt+id) y filtrable por accion/tipo de
 * entidad: antes devolvia siempre los ultimos 100 eventos sin forma de
 * ver mas historial ni de acotar la busqueda.
 */
export async function getGroupAuditLog(groupId: string, actingUserId: string, filters: AuditLogFilters = {}): Promise<Page<AuditLogEntry>> {
  await requireGroupAdmin(groupId, actingUserId);

  const pageSize = clampLimit(filters.limit ? String(filters.limit) : null, DEFAULT_PAGE_LIMIT);
  const cursor = decodeCursor<AuditLogCursor>(filters.cursor);

  const conditions = [eq(auditLogs.groupId, groupId)];
  if (filters.action) conditions.push(eq(auditLogs.action, filters.action));
  if (filters.entityType) conditions.push(eq(auditLogs.entityType, filters.entityType));
  const cursorCondition = buildAuditLogCursorCondition(cursor);
  if (cursorCondition) conditions.push(cursorCondition);

  const rows = await db
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
    .where(and(...conditions))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(pageSize + 1);

  return toPage(rows, pageSize);
}

/**
 * Historial de auditoria de entidades sin `groupId` (Fase 6: catalogo de
 * monedas). Restringido a administradores de plataforma. Mismo soporte
 * de paginacion por cursor y filtros que `getGroupAuditLog`.
 */
export async function getPlatformAuditLog(actingUserId: string, filters: AuditLogFilters = {}): Promise<Page<AuditLogEntry>> {
  await requirePlatformAdmin(actingUserId);

  const pageSize = clampLimit(filters.limit ? String(filters.limit) : null, DEFAULT_PAGE_LIMIT);
  const cursor = decodeCursor<AuditLogCursor>(filters.cursor);

  const conditions = [isNull(auditLogs.groupId)];
  if (filters.action) conditions.push(eq(auditLogs.action, filters.action));
  if (filters.entityType) conditions.push(eq(auditLogs.entityType, filters.entityType));
  const cursorCondition = buildAuditLogCursorCondition(cursor);
  if (cursorCondition) conditions.push(cursorCondition);

  const rows = await db
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
    .where(and(...conditions))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(pageSize + 1);

  return toPage(rows, pageSize);
}

type AuditLogEntry = {
  id: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  actorUserId: string;
  actorAlias: string;
  beforeData: unknown;
  afterData: unknown;
  createdAt: Date;
};

function toPage(rows: AuditLogEntry[], pageSize: number): Page<AuditLogEntry> {
  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null;
  return { items, nextCursor };
}
