import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { countUnreadNotifications, listNotifications, markAllNotificationsRead } from "@/lib/notifications/service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const searchParams = new URL(request.url).searchParams;
  const cursor = searchParams.get("cursor");
  const limit = searchParams.get("limit");

  try {
    const [{ items, nextCursor }, unreadCount] = await Promise.all([
      listNotifications(auth.userId, { cursor, limit: limit ? Number(limit) : undefined }),
      countUnreadNotifications(auth.userId),
    ]);
    return NextResponse.json({ notifications: items, nextCursor, unreadCount });
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
