import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { createGroupSchema } from "@/lib/validation/groups";
import { createGroup, listUserGroups } from "@/lib/groups/service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  try {
    const rows = await listUserGroups(auth.userId);
    return NextResponse.json({ groups: rows });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => null);
  const parsed = createGroupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const group = await createGroup(auth.userId, parsed.data.name);
    return NextResponse.json({ group }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
