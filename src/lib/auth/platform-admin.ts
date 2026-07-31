import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { AppError } from "@/lib/errors";

/**
 * Comprueba si un usuario es administrador de plataforma (Fase 6):
 * distinto del rol "admin" de `memberships` (que es por grupo). Gestiona
 * catalogos globales como monedas. No se guarda en el JWT de sesion (igual
 * que el rol de grupo, que tampoco viaja en el token) para que revocar el
 * permiso surta efecto de inmediato sin esperar a que caduque la sesion.
 */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const [user] = await db.select({ isPlatformAdmin: users.isPlatformAdmin }).from(users).where(eq(users.id, userId)).limit(1);
  return user?.isPlatformAdmin ?? false;
}

export async function requirePlatformAdmin(userId: string): Promise<void> {
  const isAdmin = await isPlatformAdmin(userId);
  if (!isAdmin) {
    throw new AppError(403, "Requiere permisos de administrador de plataforma", "not_platform_admin");
  }
}
