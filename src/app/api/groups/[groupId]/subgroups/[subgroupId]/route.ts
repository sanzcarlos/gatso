import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { getSubgroupDetail } from "@/lib/groups/subgroup-service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ groupId: string; subgroupId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const { groupId, subgroupId } = await params;

  try {
    const detail = await getSubgroupDetail(groupId, subgroupId, auth.userId);
    return NextResponse.json(detail);
  } catch (error) {
    return errorResponse(error);
  }
}
