import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { createSettlementPaymentSchema } from "@/lib/validation/settlements";
import { recordSettlementPayment } from "@/lib/settlements/service";
import { parseAmountToCents } from "@/lib/money";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const { groupId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = createSettlementPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const payment = await recordSettlementPayment(groupId, auth.userId, {
      subgroupId: parsed.data.subgroupId,
      fromUserId: parsed.data.fromUserId,
      toUserId: parsed.data.toUserId,
      amountCents: parseAmountToCents(parsed.data.amount),
      currencyCode: parsed.data.currencyCode,
      method: parsed.data.method,
    });
    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
