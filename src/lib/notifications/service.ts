import { and, desc, eq } from "drizzle-orm";
import { db, notifications } from "@/db";
import type { Tx } from "@/db";
import type { NewNotification } from "@/db/schema/notifications";

/** Crea una notificacion. Puede usarse dentro de una transaccion (tx) o fuera (db). */
export async function createNotification(client: Tx | typeof db, data: NewNotification) {
  const [notification] = await client.insert(notifications).values(data).returning();
  return notification;
}

export async function listNotifications(userId: string) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt));
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
