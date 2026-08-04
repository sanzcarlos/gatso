import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { revokeGroupInvitation } from "@/lib/groups/invitation-service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ groupId: string; invitationId: string }>;
}

/** Revoca (borra) una invitacion pendiente. Permitido a quien la creo o a un administrador del grupo. */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const { groupId, invitationId } = await params;

  try {
    const removed = await revokeGroupInvitation(groupId, auth.userId, invitationId);
    return NextResponse.json({ removed });
  } catch (error) {
    return errorResponse(error);
  }
}
