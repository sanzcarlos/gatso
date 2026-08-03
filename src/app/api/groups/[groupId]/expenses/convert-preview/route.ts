import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, groups } from "@/db";
import { requireSession } from "@/lib/auth/require-session";
import { requireMembership } from "@/lib/groups/service";
import { convertCents } from "@/lib/exchange-rates/service";
import { parseAmountToCents, centsToAmount } from "@/lib/money";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

/**
 * Previsualizacion de conversion (Fase 10): dado un importe/moneda que se
 * esta introduciendo en el formulario de un gasto, devuelve el equivalente
 * en la moneda base del grupo usando el cambio de referencia del BCE, para
 * que el usuario vea "≈ X EUR" mientras rellena el formulario, antes de
 * guardar nada. Solo lectura, no crea ni modifica ningun gasto.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const { groupId } = await params;
  const url = new URL(request.url);
  const amount = url.searchParams.get("amount");
  const currencyCode = url.searchParams.get("currencyCode");

  if (!amount || !currencyCode) {
    return NextResponse.json({ error: "Parametros invalidos" }, { status: 400 });
  }

  try {
    await requireMembership(groupId, auth.userId);

    const [group] = await db.select({ baseCurrencyCode: groups.baseCurrencyCode }).from(groups).where(eq(groups.id, groupId)).limit(1);
    const baseCurrencyCode = group?.baseCurrencyCode ?? "EUR";

    if (currencyCode === baseCurrencyCode) {
      return NextResponse.json({ baseCurrencyCode, convertedAmount: null });
    }

    const cents = await convertCents(parseAmountToCents(amount), currencyCode, baseCurrencyCode);
    return NextResponse.json({ baseCurrencyCode, convertedAmount: centsToAmount(cents) });
  } catch (error) {
    return errorResponse(error);
  }
}
