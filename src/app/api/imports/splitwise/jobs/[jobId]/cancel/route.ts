import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { cancelSplitwiseImportJob } from "@/lib/imports/splitwise/job-service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ jobId: string }>;
}

/** Cancelacion cooperativa (backlog): marca el job para que se detenga en el siguiente punto de control, no lo interrumpe a mitad de una escritura. */
export async function POST(_request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const { jobId } = await params;

  try {
    const job = await cancelSplitwiseImportJob(auth.userId, jobId);
    return NextResponse.json({ job });
  } catch (error) {
    return errorResponse(error);
  }
}
