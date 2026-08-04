import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getSessionDisplayInfo } from "@/lib/users/service";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null });
  }
  const { displayName, isPlatformAdmin } = await getSessionDisplayInfo(session.userId);
  return NextResponse.json({
    user: { id: session.userId, username: session.username, displayName, isPlatformAdmin },
  });
}
