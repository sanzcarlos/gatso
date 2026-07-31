import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { createCurrencySchema } from "@/lib/validation/currencies";
import { createCurrency, listAllCurrencies } from "@/lib/currencies/service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  try {
    const currencies = await listAllCurrencies(auth.userId);
    return NextResponse.json({ currencies });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => null);
  const parsed = createCurrencySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const currency = await createCurrency(auth.userId, parsed.data);
    return NextResponse.json({ currency }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
