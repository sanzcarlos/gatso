import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { pushSubscriptionSchema } from "@/lib/validation/push";
import { saveSubscription } from "@/lib/push/service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => null);
  const parsed = pushSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await saveSubscription(auth.userId, parsed.data);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
