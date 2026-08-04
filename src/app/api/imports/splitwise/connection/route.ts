import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { hasActiveSplitwiseConnection, disconnectSplitwise } from "@/lib/imports/splitwise/connection-service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

/** Estado de la conexion con Splitwise del usuario actual (sin exponer ningun dato del token). */
export async function GET() {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  try {
    const connected = await hasActiveSplitwiseConnection(auth.userId);
    return NextResponse.json({ connected });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Revoca/borra la conexion con Splitwise (el usuario puede reconectar en cualquier momento). */
export async function DELETE() {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  try {
    await disconnectSplitwise(auth.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
