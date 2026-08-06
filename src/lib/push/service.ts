import webpush from "web-push";
import { and, eq } from "drizzle-orm";
import { db, pushSubscriptions } from "@/db";
import { AppError } from "@/lib/errors";
import { getPushConfig, isPushConfigured } from "./config";

export interface WebPushSubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * Guarda o actualiza una suscripcion push del usuario actual (Backlog:
 * "implementar notificaciones push"). Upsert por `endpoint` (unico en el
 * esquema): si el mismo dispositivo ya estaba suscrito con otro usuario
 * (p.ej. tras cerrar sesion y entrar con otra cuenta en el mismo
 * navegador), la suscripcion se reasigna al usuario actual en vez de
 * fallar por la restriccion UNIQUE.
 */
export async function saveSubscription(userId: string, subscription: WebPushSubscriptionInput) {
  if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    throw new AppError(400, "Suscripcion push invalida", "invalid_push_subscription");
  }
  const [saved] = await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
    })
    .returning({ id: pushSubscriptions.id });
  return saved ?? null;
}

/** Borra la suscripcion del endpoint indicado, solo si pertenece al usuario actual. */
export async function removeSubscription(userId: string, endpoint: string) {
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

/** Indica si el usuario tiene al menos una suscripcion activa (usado por el cliente para reflejar el estado del toggle entre pestanas/dispositivos). */
export async function hasActiveSubscription(userId: string): Promise<boolean> {
  const [row] = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)).limit(1);
  return Boolean(row);
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * Envia una notificacion push a todos los dispositivos suscritos de un
 * usuario. Deliberadamente "best effort": nunca lanza (un fallo de push
 * no debe romper el flujo que crea la notificacion en BD, que es la
 * fuente de verdad e independiente de si el push llega o no) y se llama
 * SIEMPRE despues de que la transaccion que crea la notificacion ya se
 * ha confirmado (ver `src/lib/expenses/service.ts` y
 * `src/lib/settlements/service.ts`), nunca dentro de ella.
 *
 * Si el servicio push devuelve 404/410 (endpoint caducado o revocado por
 * el navegador), la suscripcion se borra: es la unica senal fiable de que
 * ya no es utilizable.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!isPushConfigured()) return;
  const config = getPushConfig();
  if (!config) return;

  try {
    const subscriptions = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
    if (subscriptions.length === 0) return;

    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            JSON.stringify(payload),
          );
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id));
          } else {
            console.error("Error al enviar notificacion push:", error);
          }
        }
      }),
    );
  } catch (error) {
    console.error("Error al preparar el envio de notificaciones push:", error);
  }
}
