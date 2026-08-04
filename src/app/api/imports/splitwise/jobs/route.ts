import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { createSplitwiseImportJobSchema } from "@/lib/validation/imports";
import { createSplitwiseImportJob, listSplitwiseImportJobs } from "@/lib/imports/splitwise/job-service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

/** Historial de importaciones del usuario actual. */
export async function GET() {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  try {
    const jobs = await listSplitwiseImportJobs(auth.userId);
    return NextResponse.json({ jobs });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Confirma y crea un trabajo de importacion desde Splitwise (backlog:
 * "confirmacion y creacion del trabajo"). Procesa el primer lote de
 * gastos de forma sincrona antes de responder; si el trabajo tiene mas
 * paginas pendientes, el cliente debe seguir consultando/reintentando
 * (`GET /api/imports/[jobId]`, `POST /api/imports/[jobId]/retry`).
 */
export async function POST(request: Request) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => null);
  const parsed = createSplitwiseImportJobSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const job = await createSplitwiseImportJob(auth.userId, parsed.data);
    return NextResponse.json({ job }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
