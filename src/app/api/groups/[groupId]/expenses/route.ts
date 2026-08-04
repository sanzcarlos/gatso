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
  const searchParams = new URL(request.url).searchParams;
  const subgroupId = searchParams.get("subgroupId") ?? undefined;
  const cursor = searchParams.get("cursor");
  const limit = searchParams.get("limit");

  try {
    const { items, nextCursor } = await listExpenses(groupId, auth.userId, {
      subgroupId,
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
    return NextResponse.json({ expenses: items, nextCursor });
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
