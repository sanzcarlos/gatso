import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { createExpenseSchema } from "@/lib/validation/expenses";
import { createExpense, listExpenses } from "@/lib/expenses/service";
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
    const expenses = await listExpenses(groupId, auth.userId, subgroupId);
    return NextResponse.json({ expenses });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const { groupId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = createExpenseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const expense = await createExpense(groupId, auth.userId, parsed.data);
    return NextResponse.json({ expense }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
