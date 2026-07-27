import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { registerSchema } from "@/lib/validation/auth";
import { hashSecret } from "@/lib/auth/password";
import { generateRecoveryCode, normalizeRecoveryCode } from "@/lib/auth/recovery-code";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos invalidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { alias, password } = parsed.data;

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.alias, alias)).limit(1);
  if (existing.length > 0) {
    return NextResponse.json({ error: "El alias ya esta en uso" }, { status: 409 });
  }

  const passwordHash = await hashSecret(password);
  const recoveryCode = generateRecoveryCode();
  const recoveryCodeHash = await hashSecret(normalizeRecoveryCode(recoveryCode));

  const [user] = await db
    .insert(users)
    .values({ alias, passwordHash, recoveryCodeHash })
    .returning({ id: users.id, alias: users.alias });

  if (!user) {
    return NextResponse.json({ error: "No se pudo crear el usuario" }, { status: 500 });
  }

  const token = await createSessionToken({ userId: user.id, alias: user.alias });
  await setSessionCookie(token);

  return NextResponse.json(
    {
      user: { id: user.id, alias: user.alias },
      recoveryCode,
      warning:
        "Guarda este codigo de recuperacion en un lugar seguro: es la unica forma de recuperar tu cuenta si olvidas tu contrasena, y no se mostrara de nuevo.",
    },
    { status: 201 },
  );
}
