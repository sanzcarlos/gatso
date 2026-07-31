import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { getExpenseStats } from "@/lib/expenses/service";
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
    const stats = await getExpenseStats(groupId, auth.userId, subgroupId);
    return NextResponse.json({ stats });
  } catch (error) {
    return errorResponse(error);
  }
}
