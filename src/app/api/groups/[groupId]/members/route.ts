import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { listMembers } from "@/lib/groups/service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const { groupId } = await params;

  try {
    const members = await listMembers(groupId, auth.userId);
    return NextResponse.json({ members });
  } catch (error) {
    return errorResponse(error);
  }
}
