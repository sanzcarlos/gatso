import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { reconcileSplitwiseImport } from "@/lib/imports/splitwise/reconciliation-service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ jobId: string }>;
}

/**
 * Reconciliacion de balances tras la importacion (backlog: "comparar
 * balances de origen y destino por moneda y participante"). Solo
 * lectura: no modifica nada, puede repetirse (dry-run) tantas veces como
 * se quiera.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const { jobId } = await params;

  try {
    const report = await reconcileSplitwiseImport(auth.userId, jobId);
    return NextResponse.json({ report });
  } catch (error) {
    return errorResponse(error);
  }
}
