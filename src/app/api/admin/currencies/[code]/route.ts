import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { updateCurrencyStatusSchema } from "@/lib/validation/currencies";
import { setCurrencyActive } from "@/lib/currencies/service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ code: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const { code } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateCurrencyStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const currency = await setCurrencyActive(auth.userId, code.toUpperCase(), parsed.data.isActive);
    return NextResponse.json({ currency });
  } catch (error) {
    return errorResponse(error);
  }
}
