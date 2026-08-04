import { and, eq } from "drizzle-orm";
import { alias as aliasTable } from "drizzle-orm/pg-core";
import { db, users, memberships } from "@/db";
import type { Tx } from "@/db";
import { AppError } from "@/lib/errors";
import { isUniqueViolation } from "@/lib/db/errors";
import { hashSecret } from "@/lib/auth/password";
import { generateRecoveryCode, normalizeRecoveryCode } from "@/lib/auth/recovery-code";

/**
 * Perfil publico de un usuario (solo lectura). Por diseno de privacidad no
 * se expone el hash de contrasena ni el hash del codigo de recuperacion:
 * solo `username` (credencial de acceso, no editable), `displayName`
 * (nombre visible, editable) y fecha de alta.
 *
 * Autorizacion (Fase 4): solo se puede consultar el perfil propio o el de
 * alguien con quien se comparte al menos un grupo (evita que cualquier
 * usuario autenticado pueda enumerar perfiles por UUID sin relacion
 * alguna). Si no hay relacion, se devuelve el mismo error 404 que si el
 * usuario no existiera, para no revelar si un UUID corresponde a una
 * cuenta real.
 */
export async function getPublicProfile(requestingUserId: string, targetUserId: string) {
  if (requestingUserId !== targetUserId) {
    const requesterMemberships = aliasTable(memberships, "requester_memberships");
    const [shared] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .innerJoin(requesterMemberships, eq(requesterMemberships.groupId, memberships.groupId))
      .where(and(eq(memberships.userId, targetUserId), eq(requesterMemberships.userId, requestingUserId)))
      .limit(1);
    if (!shared) {
      throw new AppError(404, "Usuario no encontrado", "user_not_found");
    }
  }

  const [user] = await db
    .select({ id: users.id, username: users.username, displayName: users.displayName, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  if (!user) throw new AppError(404, "Usuario no encontrado", "user_not_found");
  return user;
}

/**
 * Lista, sin duplicados, todos los usuarios con los que el usuario
 * indicado comparte al menos un grupo (incluyendose a si mismo), sin
 * enumeracion abierta (mismo criterio de relacion que
 * `getPublicProfile`). Usado por el mapeo de participantes de la
 * importacion desde Splitwise (Fase 11): permite elegir directamente a
 * cualquier persona ya conocida de otro grupo, no solo a los miembros
 * actuales del grupo destino concreto.
 */
export async function listKnownUsers(requestingUserId: string) {
  const myGroups = aliasTable(memberships, "my_groups");
  const rows = await db
    .selectDistinct({ id: users.id, username: users.username, displayName: users.displayName })
    .from(memberships)
    .innerJoin(myGroups, eq(myGroups.groupId, memberships.groupId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(myGroups.userId, requestingUserId))
    .orderBy(users.displayName);
  return rows;
}

/**
 * Crea un usuario nuevo (username + contrasena, con un nombre visible
 * inicial) de forma segura frente a condiciones de carrera: aunque se
 * compruebe la disponibilidad del username antes de insertar (UX rapida,
 * mensaje claro), dos registros concurrentes con el mismo username solo
 * pueden dar lugar a una fila real gracias al constraint UNIQUE de
 * `users.username`; el segundo insert se traduce en un 409 explicito en
 * vez de un error 500 sin manejar. Reutilizado por el registro normal y
 * por la aceptacion de invitaciones a grupo.
 *
 * `displayName` es opcional: si no se indica, se usa el propio
 * `username` como nombre visible inicial (la persona puede cambiarlo
 * despues en cualquier momento, a diferencia del username).
 */
export async function createUserWithUsername(
  username: string,
  password: string,
  displayName?: string | null,
  client: Tx | typeof db = db,
) {
  const existing = await client.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
  if (existing.length > 0) {
    throw new AppError(409, "El usuario ya esta en uso", "username_taken");
  }

  const passwordHash = await hashSecret(password);
  const recoveryCode = generateRecoveryCode();
  const recoveryCodeHash = await hashSecret(normalizeRecoveryCode(recoveryCode));

  try {
    const [user] = await client
      .insert(users)
      .values({ username, displayName: displayName?.trim() || username, passwordHash, recoveryCodeHash })
      .returning({ id: users.id, username: users.username, displayName: users.displayName });
    if (!user) throw new AppError(500, "No se pudo crear el usuario");
    return { user, recoveryCode };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, "El usuario ya esta en uso", "username_taken");
    }
    throw error;
  }
}

/**
 * Actualiza el nombre visible del propio usuario. A diferencia del
 * `username` (credencial de acceso, sin flujo de cambio), el
 * `displayName` es editable libremente en cualquier momento: sin
 * restriccion de unicidad ni de patron, solo de longitud
 * (`displayNameSchema`). No requiere contrasena ni afecta a la sesion
 * activa (el JWT nunca guarda `displayName`, ver `src/lib/auth/session.ts`,
 * para que el cambio surta efecto de inmediato en cualquier pestana sin
 * esperar a que caduque la sesion).
 */
export async function updateDisplayName(userId: string, displayName: string) {
  const [updated] = await db
    .update(users)
    .set({ displayName: displayName.trim() })
    .where(eq(users.id, userId))
    .returning({ id: users.id, username: users.username, displayName: users.displayName });
  if (!updated) throw new AppError(404, "Usuario no encontrado", "user_not_found");
  return updated;
}

/**
 * Datos derivados de la sesion que no viven en el JWT (Fase 6: mismo
 * criterio que `isPlatformAdmin`, se consulta en BD en cada peticion para
 * que revocar/editar surta efecto inmediato). Se agrupan en una sola
 * consulta para las paginas que ya necesitaban ambos datos por separado
 * (`SiteHeader`, portada).
 */
export async function getSessionDisplayInfo(userId: string) {
  const [user] = await db
    .select({ displayName: users.displayName, isPlatformAdmin: users.isPlatformAdmin })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return { displayName: user?.displayName ?? null, isPlatformAdmin: user?.isPlatformAdmin ?? false };
}
