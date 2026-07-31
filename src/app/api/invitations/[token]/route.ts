import { NextResponse } from "next/server";
import { getInvitationPreview } from "@/lib/groups/invitation-service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ token: string }>;
}

/** Ruta publica (sin sesion): permite ver el grupo al que invita el enlace antes de crear cuenta. */
export async function GET(_request: Request, { params }: RouteParams) {
  const { token } = await params;

  try {
    const preview = await getInvitationPreview(token);
    return NextResponse.json(preview);
  } catch (error) {
    return errorResponse(error);
  }
}
