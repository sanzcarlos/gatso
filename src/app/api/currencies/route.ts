import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { listActiveCurrencies } from "@/lib/currencies/service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  try {
    const currencies = await listActiveCurrencies();
    return NextResponse.json({ currencies });
  } catch (error) {
    return errorResponse(error);
  }
}
