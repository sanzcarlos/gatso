import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { getPublicProfile, updateDisplayName } from "@/lib/users/service";
import { updateDisplayNameSchema } from "@/lib/validation/auth";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ userId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const { userId } = await params;

  try {
    const profile = await getPublicProfile(auth.userId, userId);
    return NextResponse.json({ profile });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Actualiza el nombre visible (`displayName`) del propio usuario. A
 * diferencia del `username` (credencial de acceso, sin flujo de cambio),
 * solo se permite editar el perfil propio: nunca el de otro usuario, aunque
 * se comparta grupo con el.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const { userId } = await params;
  if (userId !== auth.userId) {
    return NextResponse.json({ error: "Solo puedes editar tu propio perfil" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateDisplayNameSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const updated = await updateDisplayName(auth.userId, parsed.data.displayName);
    return NextResponse.json({ user: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
