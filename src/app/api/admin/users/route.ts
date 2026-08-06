import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { listAllUsers } from "@/lib/users/service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  try {
    const users = await listAllUsers(auth.userId);
    return NextResponse.json({ users });
  } catch (error) {
    return errorResponse(error);
  }
}
