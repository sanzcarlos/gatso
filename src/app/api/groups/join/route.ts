import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { joinGroupSchema } from "@/lib/validation/groups";
import { joinGroupByInviteCode } from "@/lib/groups/service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => null);
  const parsed = joinGroupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await joinGroupByInviteCode(auth.userId, parsed.data.inviteCode);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
