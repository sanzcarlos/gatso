import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { restoreArchivedGroup } from "@/lib/groups/service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const { groupId } = await params;

  try {
    const group = await restoreArchivedGroup(auth.userId, groupId);
    return NextResponse.json({ group });
  } catch (error) {
    return errorResponse(error);
  }
}
