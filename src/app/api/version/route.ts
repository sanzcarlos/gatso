import { NextResponse } from "next/server";
import { getVersionInfo } from "@/lib/version";

export const runtime = "nodejs";

/**
 * Version desplegada en formato JSON (uso programatico: scripts de
 * verificacion post-deploy, monitorizacion externa). Version legible por
 * humanos en la pagina `/version`. Sin autenticacion: no expone datos
 * sensibles, solo version, entorno y commit de Git.
 */
export async function GET() {
  return NextResponse.json(getVersionInfo());
}
