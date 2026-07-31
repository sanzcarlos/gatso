import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { getExpenseDetail, deleteExpense, updateExpense } from "@/lib/expenses/service";
import { updateExpenseSchema } from "@/lib/validation/expenses";
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
    const detail = await getExpenseDetail(groupId, expenseId, auth.userId);
    return NextResponse.json(detail);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const { groupId, expenseId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateExpenseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const expense = await updateExpense(groupId, expenseId, auth.userId, parsed.data);
    return NextResponse.json({ expense });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const { groupId, expenseId } = await params;

  try {
    const deleted = await deleteExpense(groupId, expenseId, auth.userId);
    return NextResponse.json({ deleted });
  } catch (error) {
    return errorResponse(error);
  }
}
