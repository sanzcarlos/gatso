import { and, count, desc, eq, lt, or } from "drizzle-orm";
import { db, notifications } from "@/db";
import type { Tx } from "@/db";
import type { NewNotification } from "@/db/schema/notifications";
import { DEFAULT_PAGE_LIMIT, clampLimit, decodeCursor, encodeCursor, type Page } from "@/lib/pagination";

/** Crea una notificacion. Puede usarse dentro de una transaccion (tx) o fuera (db). */
export async function createNotification(client: Tx | typeof db, data: NewNotification) {
  const [notification] = await client.insert(notifications).values(data).returning();
  return notification;
}

export interface NotificationCursor {
  createdAt: string;
  id: string;
}

export interface ListNotificationsOptions {
  cursor?: string | null | undefined;
  limit?: number | undefined;
}

/**
 * Lista notificaciones de un usuario paginadas por cursor (keyset sobre
 * `createdAt`+`id`): antes se devolvia el historial completo sin limite,
 * lo que crecia sin cota con el tiempo (cada edicion ajena de un gasto o
 * cada pago de liquidacion registrado anade una fila nueva).
 */
export async function listNotifications(userId: string, options: ListNotificationsOptions = {}): Promise<Page<typeof notifications.$inferSelect>> {
  const pageSize = clampLimit(options.limit ? String(options.limit) : null, DEFAULT_PAGE_LIMIT);
  const cursor = decodeCursor<NotificationCursor>(options.cursor);

  const cursorCondition = cursor
    ? or(
        lt(notifications.createdAt, new Date(cursor.createdAt)),
        and(eq(notifications.createdAt, new Date(cursor.createdAt)), lt(notifications.id, cursor.id)),
      )
    : undefined;

  const whereCondition = cursorCondition ? and(eq(notifications.userId, userId), cursorCondition) : eq(notifications.userId, userId);

  const rows = await db
    .select()
    .from(notifications)
    .where(whereCondition)
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(pageSize + 1);

  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null;

  return { items, nextCursor };
}

/** Contador de notificaciones no leidas, independiente de la paginacion de `listNotifications`. */
export async function countUnreadNotifications(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  return row?.value ?? 0;
}

export async function markNotificationRead(notificationId: string, userId: string) {
  const [updated] = await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
    .returning();
  return updated ?? null;
}

export async function markAllNotificationsRead(userId: string) {
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
}

/** Marca como leidas todas las notificaciones asociadas a un gasto concreto (p.ej. al validarlo). */
export async function resolveExpenseNotifications(client: Tx | typeof db, expenseId: string) {
  await client.update(notifications).set({ isRead: true }).where(eq(notifications.expenseId, expenseId));
}
