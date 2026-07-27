import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { updateGroupSchema } from "@/lib/validation/groups";
import { getGroupDetail, updateGroupName } from "@/lib/groups/service";
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
    const detail = await getGroupDetail(groupId, auth.userId);
    return NextResponse.json(detail);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const { groupId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateGroupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const group = await updateGroupName(groupId, auth.userId, parsed.data.name);
    return NextResponse.json({ group });
  } catch (error) {
    return errorResponse(error);
  }
}
