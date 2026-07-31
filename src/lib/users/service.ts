import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { AppError } from "@/lib/errors";

/**
 * Perfil publico de un usuario (solo lectura). Por diseno de privacidad no
 * se expone el hash de contrasena ni el hash del codigo de recuperacion:
 * solo alias y fecha de alta.
 */
export async function getPublicProfile(userId: string) {
  const [user] = await db
    .select({ id: users.id, alias: users.alias, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new AppError(404, "Usuario no encontrado", "user_not_found");
  return user;
}
