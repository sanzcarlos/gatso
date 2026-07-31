import { customAlphabet } from "nanoid";
import { and, count, eq, isNull } from "drizzle-orm";
import { db, groupInvitations, groups, memberships, users } from "@/db";
import { AppError } from "@/lib/errors";
import { isUniqueViolation } from "@/lib/db/errors";
import { createUserWithAlias } from "@/lib/users/service";
import { requireMembership } from "./service";
import { addUserToAllGroupSubgroups } from "./subgroup-service";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";

export const INVITATION_TTL_MS = 24 * 60 * 60 * 1000;
const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const generateToken = customAlphabet(TOKEN_ALPHABET, 32);

/**
 * Invitacion personal a un grupo: a diferencia del `invite_code` publico
 * (compartible libremente, sin caducidad), esta genera un enlace unico de
 * un solo uso que caduca a las 24 horas, pensado para invitar a una
 * persona concreta que todavia no tiene cuenta en la aplicacion.
 */
export async function createGroupInvitation(groupId: string, actingUserId: string) {
  await requireMembership(groupId, actingUserId);

  const [invitation] = await db
    .insert(groupInvitations)
    .values({
      groupId,
      token: generateToken(),
      createdBy: actingUserId,
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    })
    .returning();
  if (!invitation) throw new AppError(500, "No se pudo crear la invitacion");
  return invitation;
}

export async function listGroupInvitations(groupId: string, actingUserId: string) {
  await requireMembership(groupId, actingUserId);
  return db
    .select({
      id: groupInvitations.id,
      token: groupInvitations.token,
      expiresAt: groupInvitations.expiresAt,
      usedAt: groupInvitations.usedAt,
      createdAt: groupInvitations.createdAt,
      createdByAlias: users.alias,
    })
    .from(groupInvitations)
    .innerJoin(users, eq(users.id, groupInvitations.createdBy))
    .where(and(eq(groupInvitations.groupId, groupId), isNull(groupInvitations.usedAt)))
    .orderBy(groupInvitations.createdAt);
}

function assertInvitationValid(invitation: typeof groupInvitations.$inferSelect) {
  if (invitation.usedAt) {
    throw new AppError(410, "Esta invitacion ya ha sido utilizada", "invitation_already_used");
  }
  if (invitation.expiresAt.getTime() < Date.now()) {
    throw new AppError(410, "Esta invitacion ha caducado", "invitation_expired");
  }
}

/** Datos publicos de una invitacion (para la pagina de aceptacion, sin sesion). */
export async function getInvitationPreview(token: string) {
  const [row] = await db
    .select({ invitation: groupInvitations, groupName: groups.name })
    .from(groupInvitations)
    .innerJoin(groups, eq(groups.id, groupInvitations.groupId))
    .where(eq(groupInvitations.token, token))
    .limit(1);
  if (!row) throw new AppError(404, "Invitacion no encontrada", "invitation_not_found");

  assertInvitationValid(row.invitation);

  return { groupName: row.groupName, expiresAt: row.invitation.expiresAt };
}

/**
 * Acepta una invitacion: crea el usuario (alias + contrasena elegidos por
 * la persona invitada) y lo anade como miembro del grupo, todo en una
 * transaccion con la fila de invitacion bloqueada (`for("update")`) para
 * evitar que el mismo enlace de un solo uso se consuma dos veces en
 * paralelo.
 */
export async function acceptGroupInvitation(token: string, alias: string, password: string) {
  return db.transaction(async (tx) => {
    const [invitation] = await tx
      .select()
      .from(groupInvitations)
      .where(eq(groupInvitations.token, token))
      .for("update")
      .limit(1);
    if (!invitation) throw new AppError(404, "Invitacion no encontrada", "invitation_not_found");
    assertInvitationValid(invitation);

    const [group] = await tx.select().from(groups).where(eq(groups.id, invitation.groupId)).for("update").limit(1);
    if (!group) throw new AppError(404, "Grupo no encontrado", "group_not_found");

    const memberCount = await tx
      .select({ value: count() })
      .from(memberships)
      .where(eq(memberships.groupId, group.id));
    if ((memberCount[0]?.value ?? 0) >= group.maxMembers) {
      throw new AppError(409, `El grupo ha alcanzado el limite de ${group.maxMembers} miembros`, "group_full");
    }

    const { user } = await createUserWithAlias(alias, password, tx);

    try {
      await tx.insert(memberships).values({ groupId: group.id, userId: user.id, role: "member" });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(409, "Ya eres miembro de este grupo", "already_member");
      }
      throw error;
    }

    await addUserToAllGroupSubgroups(tx, group.id, user.id);

    await tx
      .update(groupInvitations)
      .set({ usedAt: new Date(), usedByUserId: user.id })
      .where(eq(groupInvitations.id, invitation.id));

    const sessionToken = await createSessionToken({ userId: user.id, alias: user.alias });
    await setSessionCookie(sessionToken);

    return { user, group };
  });
}
