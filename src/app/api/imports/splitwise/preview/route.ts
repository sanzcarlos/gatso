import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { previewSplitwiseSchema } from "@/lib/validation/imports";
import { buildSplitwisePreview } from "@/lib/imports/splitwise/preview-service";
import { errorResponse } from "@/lib/api/handle-error";

export const runtime = "nodejs";

/**
 * Vista previa de una importacion desde Splitwise (backlog Fase 11:
 * "validacion y plan sin escritura financiera"). No crea ningun job ni
 * escribe nada en Gatso; solo lee de la API de Splitwise.
 */
export async function POST(request: Request) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => null);
  const parsed = previewSplitwiseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const preview = await buildSplitwisePreview(auth.userId, parsed.data.sourceGroupExternalId);
    return NextResponse.json({ preview });
  } catch (error) {
    return errorResponse(error);
  }
}
