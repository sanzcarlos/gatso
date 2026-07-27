import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { addSubgroupMember, listSubgroupMembers } from "@/lib/groups/subgroup-service";
import { errorResponse } from "@/lib/api/handle-error";
import { z } from "zod";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ groupId: string; subgroupId: string }>;
}

const addMemberSchema = z.object({
  userId: z.string().uuid("userId invalido"),
});

export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const { groupId, subgroupId } = await params;

  try {
    const members = await listSubgroupMembers(groupId, subgroupId, auth.userId);
    return NextResponse.json({ members });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const { groupId, subgroupId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = addMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const member = await addSubgroupMember(groupId, subgroupId, auth.userId, parsed.data.userId);
    return NextResponse.json({ member }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
