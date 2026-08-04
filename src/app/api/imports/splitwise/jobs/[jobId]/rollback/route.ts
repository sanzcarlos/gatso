import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { rollbackSplitwiseImportJob } from "@/lib/imports/splitwise/rollback-service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ jobId: string }>;
}

/** Revierte solo las entidades creadas por este job y no modificadas despues (backlog: "idempotente y auditado"). */
export async function POST(_request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const { jobId } = await params;

  try {
    const report = await rollbackSplitwiseImportJob(auth.userId, jobId);
    return NextResponse.json({ report });
  } catch (error) {
    return errorResponse(error);
  }
}
