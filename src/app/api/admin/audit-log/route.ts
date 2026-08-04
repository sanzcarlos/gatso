import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { getPlatformAuditLog, type AuditAction } from "@/lib/audit/service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

const VALID_ACTIONS: readonly AuditAction[] = ["create", "update", "delete"];

/**
 * Historial de auditoria de entidades globales (Fase 6: catalogo de
 * monedas). Solo administradores de plataforma. Paginado por cursor y
 * filtrable por `?action=create|update|delete` y `?entityType=`.
 */
export async function GET(request: Request) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const searchParams = new URL(request.url).searchParams;
  const actionParam = searchParams.get("action");
  const action = actionParam && (VALID_ACTIONS as string[]).includes(actionParam) ? (actionParam as AuditAction) : undefined;
  const entityType = searchParams.get("entityType") ?? undefined;
  const cursor = searchParams.get("cursor");
  const limit = searchParams.get("limit");

  try {
    const { items, nextCursor } = await getPlatformAuditLog(auth.userId, {
      action,
      entityType,
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
    return NextResponse.json({ entries: items, nextCursor });
  } catch (error) {
    return errorResponse(error);
  }
}
