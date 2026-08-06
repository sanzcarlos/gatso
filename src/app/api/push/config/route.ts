import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { getPushConfig } from "@/lib/push/config";
import { hasActiveSubscription } from "@/lib/push/service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

/**
 * Estado de las notificaciones push para el cliente actual: la clave
 * publica VAPID (null si el entorno no las tiene configuradas, en cuyo
 * caso el toggle de la UI se oculta) y si el usuario ya tiene alguna
 * suscripcion activa (para reflejar el estado correcto entre pestanas o
 * tras reinstalar la PWA).
 */
export async function GET() {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  try {
    const config = getPushConfig();
    const subscribed = await hasActiveSubscription(auth.userId);
    return NextResponse.json({ publicKey: config?.publicKey ?? null, subscribed });
  } catch (error) {
    return errorResponse(error);
  }
}
