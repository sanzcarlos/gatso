import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { listNotifications, markAllNotificationsRead } from "@/lib/notifications/service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  try {
    const notifications = await listNotifications(auth.userId);
    return NextResponse.json({ notifications });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH() {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  try {
    await markAllNotificationsRead(auth.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
