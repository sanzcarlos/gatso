import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { loginSchema } from "@/lib/validation/auth";
import { verifySecret, DUMMY_HASH } from "@/lib/auth/password";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const { alias, password } = parsed.data;
  const genericError = NextResponse.json({ error: "Alias o contrasena incorrectos" }, { status: 401 });

  const [user] = await db.select().from(users).where(eq(users.alias, alias)).limit(1);

  if (!user) {
    // Verificacion contra un hash senuelo para no filtrar por temporizacion
    // si el alias existe o no.
    await verifySecret(DUMMY_HASH, password);
    return genericError;
  }

  const valid = await verifySecret(user.passwordHash, password);
  if (!valid) {
    return genericError;
  }

  const token = await createSessionToken({ userId: user.id, alias: user.alias });
  await setSessionCookie(token);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  return NextResponse.json({ user: { id: user.id, alias: user.alias } });
}
