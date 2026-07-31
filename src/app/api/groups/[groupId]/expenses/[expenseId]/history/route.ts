import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { getExpenseHistory } from "@/lib/expenses/service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ groupId: string; expenseId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const { groupId, expenseId } = await params;

  try {
    const history = await getExpenseHistory(groupId, expenseId, auth.userId);
    return NextResponse.json({ history });
  } catch (error) {
    return errorResponse(error);
  }
}
