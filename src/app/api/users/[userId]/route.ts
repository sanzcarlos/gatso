import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { getPublicProfile } from "@/lib/users/service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ userId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const { userId } = await params;

  try {
    const profile = await getPublicProfile(userId);
    return NextResponse.json({ profile });
  } catch (error) {
    return errorResponse(error);
  }
}
