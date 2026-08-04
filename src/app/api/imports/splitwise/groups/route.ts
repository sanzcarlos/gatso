import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { listSplitwiseGroups } from "@/lib/imports/splitwise/preview-service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

/** Grupos de Splitwise accesibles con la cuenta conectada del usuario actual. */
export async function GET() {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  try {
    const groups = await listSplitwiseGroups(auth.userId);
    return NextResponse.json({ groups });
  } catch (error) {
    return errorResponse(error);
  }
}
