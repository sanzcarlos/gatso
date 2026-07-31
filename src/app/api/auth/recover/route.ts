import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { recoverSchema } from "@/lib/validation/auth";
import { hashSecret, verifySecret, DUMMY_HASH } from "@/lib/auth/password";
import { generateRecoveryCode, normalizeRecoveryCode } from "@/lib/auth/recovery-code";
import { enforceAuthRateLimit, recordAuthAttempt } from "@/lib/auth/auth-rate-limit";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

/**
 * Recuperacion de cuenta sin depender de datos sensibles (sin email/telefono).
 *
 * Flujo: el usuario aporta su alias + el codigo de recuperacion de un solo
 * uso (entregado una vez al registrarse) + una nueva contrasena. Si es
 * correcto, se actualiza la contrasena y se rota el codigo de recuperacion
 * (se invalida el anterior y se entrega uno nuevo, mostrado una sola vez).
 *
 * Trade-off documentado (ver PROGRESS.md): si el usuario pierde el codigo de
 * recuperacion Y olvida su contrasena, no hay ninguna otra via de recuperar
 * la cuenta (no se recolecta email ni telefono por diseno de privacidad).
 * Esto es una decision deliberada de minimizacion de datos, no un descuido.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = recoverSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const { alias, recoveryCode, newPassword } = parsed.data;
  const genericError = NextResponse.json(
    { error: "Alias o codigo de recuperacion incorrectos" },
    { status: 401 },
  );

  try {
    await enforceAuthRateLimit(alias, "recover");
  } catch (error) {
    return errorResponse(error);
  }

  const [user] = await db.select().from(users).where(eq(users.alias, alias)).limit(1);

  if (!user || !user.recoveryCodeHash) {
    await verifySecret(DUMMY_HASH, normalizeRecoveryCode(recoveryCode));
    await recordAuthAttempt(alias, "recover", false);
    return genericError;
  }

  const valid = await verifySecret(user.recoveryCodeHash, normalizeRecoveryCode(recoveryCode));
  if (!valid) {
    await recordAuthAttempt(alias, "recover", false);
    return genericError;
  }

  await recordAuthAttempt(alias, "recover", true);

  const newPasswordHash = await hashSecret(newPassword);
  const newRecoveryCode = generateRecoveryCode();
  const newRecoveryCodeHash = await hashSecret(normalizeRecoveryCode(newRecoveryCode));

  await db
    .update(users)
    .set({ passwordHash: newPasswordHash, recoveryCodeHash: newRecoveryCodeHash })
    .where(eq(users.id, user.id));

  return NextResponse.json({
    ok: true,
    recoveryCode: newRecoveryCode,
    warning:
      "Tu contrasena se ha actualizado y se ha generado un nuevo codigo de recuperacion. Guardalo: el anterior ya no es valido.",
  });
}
