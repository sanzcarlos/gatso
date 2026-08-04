import { and, eq } from "drizzle-orm";
import { db, externalConnections } from "@/db";
import { AppError } from "@/lib/errors";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secret-box";
import { recordAuditLog } from "@/lib/audit/service";
import { SplitwiseClient, type SplitwiseTokenResponse } from "./client";

export const SPLITWISE_PROVIDER = "splitwise";

/**
 * Guarda (o reemplaza) la conexion OAuth de un usuario con Splitwise.
 * `onConflictDoUpdate` sobre `(userId, provider)`: reconectar tras
 * revocar sustituye la fila anterior en vez de acumular tokens caducados.
 * El token nunca se registra en el log de auditoria (solo el evento
 * "conexion/desconexion", ver backlog Fase 11: "sin tokens, emails ni
 * nombres reales").
 */
export async function saveSplitwiseConnection(
  userId: string,
  token: SplitwiseTokenResponse,
  externalUserId: string,
): Promise<void> {
  const accessTokenEncrypted = encryptSecret(token.access_token);
  const refreshTokenEncrypted = token.refresh_token ? encryptSecret(token.refresh_token) : null;
  const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null;

  await db
    .insert(externalConnections)
    .values({
      userId,
      provider: SPLITWISE_PROVIDER,
      externalUserId,
      accessTokenEncrypted,
      refreshTokenEncrypted,
      tokenType: token.token_type || "bearer",
      scope: token.scope ?? null,
      expiresAt,
      status: "active",
    })
    .onConflictDoUpdate({
      target: [externalConnections.userId, externalConnections.provider],
      set: {
        externalUserId,
        accessTokenEncrypted,
        refreshTokenEncrypted,
        tokenType: token.token_type || "bearer",
        scope: token.scope ?? null,
        expiresAt,
        status: "active",
        lastUsedAt: new Date(),
      },
    });

  await recordAuditLog(db, {
    actorUserId: userId,
    action: "create",
    entityType: "external_connection",
    entityId: userId,
    afterData: { provider: SPLITWISE_PROVIDER, connected: true },
  });
}

export async function getSplitwiseConnection(userId: string) {
  const [row] = await db
    .select()
    .from(externalConnections)
    .where(and(eq(externalConnections.userId, userId), eq(externalConnections.provider, SPLITWISE_PROVIDER), eq(externalConnections.status, "active")))
    .limit(1);
  return row ?? null;
}

/** Cliente de Splitwise listo para usar con el token ya descifrado del usuario. Lanza si no hay conexion activa. */
export async function getSplitwiseClientForUser(userId: string): Promise<SplitwiseClient> {
  const connection = await getSplitwiseConnection(userId);
  if (!connection) {
    throw new AppError(409, "No hay ninguna cuenta de Splitwise conectada", "splitwise_not_connected");
  }
  await db
    .update(externalConnections)
    .set({ lastUsedAt: new Date() })
    .where(eq(externalConnections.id, connection.id));
  return new SplitwiseClient(decryptSecret(connection.accessTokenEncrypted));
}

/**
 * Desconecta (borra) la conexion. Para una migracion puntual se elimina
 * el token al terminar por defecto (backlog Fase 11); esta funcion se
 * reutiliza tanto para la desconexion explicita del usuario como para el
 * borrado automatico tras un job que no pidio conservarla.
 */
export async function disconnectSplitwise(userId: string): Promise<void> {
  await db.delete(externalConnections).where(and(eq(externalConnections.userId, userId), eq(externalConnections.provider, SPLITWISE_PROVIDER)));

  await recordAuditLog(db, {
    actorUserId: userId,
    action: "delete",
    entityType: "external_connection",
    entityId: userId,
    beforeData: { provider: SPLITWISE_PROVIDER },
  });
}

export async function hasActiveSplitwiseConnection(userId: string): Promise<boolean> {
  return (await getSplitwiseConnection(userId)) !== null;
}
