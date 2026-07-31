import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { markNotificationRead } from "@/lib/notifications/service";
import { errorResponse } from "@/lib/api/handle-error";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ notificationId: string }>;
}

export async function PATCH(_request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const { notificationId } = await params;

  try {
    const notification = await markNotificationRead(notificationId, auth.userId);
    if (!notification) throw new AppError(404, "Notificacion no encontrada", "notification_not_found");
    return NextResponse.json({ notification });
  } catch (error) {
    return errorResponse(error);
  }
}
