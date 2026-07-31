import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { createGroupInvitation, listGroupInvitations } from "@/lib/groups/invitation-service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const { groupId } = await params;

  try {
    const invitations = await listGroupInvitations(groupId, auth.userId);
    return NextResponse.json({ invitations });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(_request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const { groupId } = await params;

  try {
    const invitation = await createGroupInvitation(groupId, auth.userId);
    return NextResponse.json({ invitation }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
