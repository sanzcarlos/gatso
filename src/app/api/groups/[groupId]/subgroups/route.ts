import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { createSubgroupSchema } from "@/lib/validation/groups";
import { createSubgroup, listSubgroups } from "@/lib/groups/subgroup-service";
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
    const subgroups = await listSubgroups(groupId, auth.userId);
    return NextResponse.json({ subgroups });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const { groupId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = createSubgroupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const subgroup = await createSubgroup(groupId, auth.userId, parsed.data.name);
    return NextResponse.json({ subgroup }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
