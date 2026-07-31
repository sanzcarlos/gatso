import { NextResponse } from "next/server";
import { acceptInvitationSchema } from "@/lib/validation/groups";
import { acceptGroupInvitation } from "@/lib/groups/invitation-service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ token: string }>;
}

/**
 * Ruta publica (sin sesion previa): la persona invitada define su alias y
 * contrasena aqui mismo; si todo es valido, se crea la cuenta, se anade al
 * grupo y se abre sesion automaticamente (misma UX que el registro normal).
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { token } = await params;
  const body = await request.json().catch(() => null);
  const parsed = acceptInvitationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { user, group } = await acceptGroupInvitation(token, parsed.data.alias, parsed.data.password);
    return NextResponse.json({ user: { id: user.id, alias: user.alias }, group });
  } catch (error) {
    return errorResponse(error);
  }
}
