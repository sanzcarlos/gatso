import { NextResponse } from "next/server";
import { getSession, type SessionPayload } from "./session";

/**
 * Helper para Route Handlers: obtiene la sesion o devuelve un 401 listo
 * para retornar. Uso:
 *
 *   const auth = await requireSession();
 *   if (auth instanceof NextResponse) return auth;
 *   const { userId } = auth;
 */
export async function requireSession(): Promise<SessionPayload | NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  return session;
}
