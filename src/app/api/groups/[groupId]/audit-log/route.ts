import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { getGroupAuditLog } from "@/lib/audit/service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

/** Historial de auditoria del grupo (gastos, grupo, subgrupos, membresias). Solo administradores. */
export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const { groupId } = await params;

  try {
    const entries = await getGroupAuditLog(groupId, auth.userId);
    return NextResponse.json({ entries });
  } catch (error) {
    return errorResponse(error);
  }
}
