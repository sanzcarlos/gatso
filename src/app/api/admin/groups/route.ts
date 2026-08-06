import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { listArchivedGroups } from "@/lib/groups/service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  try {
    const groups = await listArchivedGroups(auth.userId);
    return NextResponse.json({ groups });
  } catch (error) {
    return errorResponse(error);
  }
}
