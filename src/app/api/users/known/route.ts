import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { listKnownUsers } from "@/lib/users/service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

/**
 * Usuarios con los que el usuario actual comparte al menos un grupo
 * (sin duplicados, incluyendose a si mismo). Usado por el mapeo de
 * participantes de la importacion desde Splitwise para poder elegir a
 * cualquier persona conocida, no solo a los miembros del grupo destino.
 */
export async function GET() {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  try {
    const users = await listKnownUsers(auth.userId);
    return NextResponse.json({ users });
  } catch (error) {
    return errorResponse(error);
  }
}
