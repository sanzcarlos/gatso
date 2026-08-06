import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { updatePlatformAdminSchema } from "@/lib/validation/users";
import { setPlatformAdmin } from "@/lib/users/service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ userId: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const { userId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updatePlatformAdminSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const user = await setPlatformAdmin(auth.userId, userId, parsed.data.isPlatformAdmin);
    return NextResponse.json({ user });
  } catch (error) {
    return errorResponse(error);
  }
}
