import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { getSplitwiseImportJob } from "@/lib/imports/splitwise/job-service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ jobId: string }>;
}

/** Progreso e informe de un trabajo de importacion (backlog: "progreso e informe"). */
export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const { jobId } = await params;

  try {
    const result = await getSplitwiseImportJob(auth.userId, jobId);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
