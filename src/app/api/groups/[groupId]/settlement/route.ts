import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { getGroupSettlement } from "@/lib/settlements/service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const { groupId } = await params;
  const subgroupId = new URL(request.url).searchParams.get("subgroupId") ?? undefined;

  try {
    const result = await getGroupSettlement(groupId, auth.userId, subgroupId);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
