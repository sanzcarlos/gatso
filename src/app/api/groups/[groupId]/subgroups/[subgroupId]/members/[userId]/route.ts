import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { removeSubgroupMember } from "@/lib/groups/subgroup-service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ groupId: string; subgroupId: string; userId: string }>;
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const { groupId, subgroupId, userId } = await params;

  try {
    const removed = await removeSubgroupMember(groupId, subgroupId, auth.userId, userId);
    return NextResponse.json({ removed });
  } catch (error) {
    return errorResponse(error);
  }
}
