import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { retrySplitwiseImportJob } from "@/lib/imports/splitwise/job-service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ jobId: string }>;
}

/**
 * Reanuda un trabajo tras agotar el presupuesto de tiempo de un chunk o
 * corrige uno con errores reintentables (backlog: "control seguro").
 * Procesa otro chunk de forma sincrona antes de responder.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const { jobId } = await params;

  try {
    const job = await retrySplitwiseImportJob(auth.userId, jobId);
    return NextResponse.json({ job });
  } catch (error) {
    return errorResponse(error);
  }
}
