import { NextResponse } from "next/server";
import { registerSchema } from "@/lib/validation/auth";
import { createUserWithAlias } from "@/lib/users/service";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";
import { enforceRegistrationRateLimit, recordRegistrationAttempt } from "@/lib/rate-limit/service";
import { errorResponse } from "@/lib/api/handle-error";

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

  try {
    await enforceRegistrationRateLimit(alias);
    const { user, recoveryCode } = await createUserWithAlias(alias, password);
    await recordRegistrationAttempt(alias);

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
  } catch (error) {
    await recordRegistrationAttempt(alias).catch(() => {});
    return errorResponse(error);
  }
}
