import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { loginSchema } from "@/lib/validation/auth";
import { verifySecret, DUMMY_HASH } from "@/lib/auth/password";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";
import { enforceAuthRateLimit, recordAuthAttempt } from "@/lib/auth/auth-rate-limit";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const { alias, password } = parsed.data;
  const genericError = NextResponse.json({ error: "Alias o contrasena incorrectos" }, { status: 401 });

  try {
    await enforceAuthRateLimit(alias, "login");
  } catch (error) {
    return errorResponse(error);
  }

  const [user] = await db.select().from(users).where(eq(users.alias, alias)).limit(1);

  if (!user) {
    // Verificacion contra un hash senuelo para no filtrar por temporizacion
    // si el alias existe o no.
    await verifySecret(DUMMY_HASH, password);
    await recordAuthAttempt(alias, "login", false);
    return genericError;
  }

  const valid = await verifySecret(user.passwordHash, password);
  if (!valid) {
    await recordAuthAttempt(alias, "login", false);
    return genericError;
  }

  await recordAuthAttempt(alias, "login", true);

  const token = await createSessionToken({ userId: user.id, alias: user.alias });
  await setSessionCookie(token);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  return NextResponse.json({ user: { id: user.id, alias: user.alias } });
}
