import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { pushUnsubscribeSchema } from "@/lib/validation/push";
import { removeSubscription } from "@/lib/push/service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => null);
  const parsed = pushUnsubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await removeSubscription(auth.userId, parsed.data.endpoint);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
