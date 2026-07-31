import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { getPlatformAuditLog } from "@/lib/audit/service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

/** Historial de auditoria de entidades globales (Fase 6: catalogo de monedas). Solo administradores de plataforma. */
export async function GET() {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  try {
    const entries = await getPlatformAuditLog(auth.userId);
    return NextResponse.json({ entries });
  } catch (error) {
    return errorResponse(error);
  }
}
