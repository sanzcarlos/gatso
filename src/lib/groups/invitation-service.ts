import { customAlphabet } from "nanoid";
import { and, count, eq, isNull } from "drizzle-orm";
import { db, groupInvitations, groups, memberships, users, externalEntityMappings } from "@/db";
import { AppError } from "@/lib/errors";
import { isUniqueViolation } from "@/lib/db/errors";
import { createUserWithAlias } from "@/lib/users/service";
import { requireMembership } from "./service";
import { addUserToAllGroupSubgroups } from "./subgroup-service";
import { recordAuditLog } from "@/lib/audit/service";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";
import {
  enforceInvitationAcceptRateLimit,
  enforceInvitationCreateRateLimit,
  recordInvitationAcceptAttempt,
  recordInvitationCreateAttempt,
} from "@/lib/rate-limit/service";

export const INVITATION_TTL_MS = 24 * 60 * 60 * 1000;
const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const generateToken = customAlphabet(TOKEN_ALPHABET, 32);

export interface CreateGroupInvitationOptions {
  suggestedAlias?: string | null;
  /** Fase 11 ampliada: vincula la invitacion a un participante externo (ej. Splitwise) para poder auto-resolverlo al aceptarse. */
  externalProvider?: string | null;
  externalParticipantId?: string | null;
}

/**
 * Invitacion personal a un grupo: a diferencia del `invite_code` publico
 * (compartible libremente, sin caducidad), esta genera un enlace unico de
 * un solo uso que caduca a las 24 horas, pensado para invitar a una
 * persona concreta que todavia no tiene cuenta en la aplicacion.
 *
 * `suggestedAlias` (opcional, Fase 11): nombre propuesto para la persona
 * invitada (ej. su nombre en Splitwise al importar un grupo), mostrado
 * como valor prellenado -pero editable- en el formulario de aceptacion;
 * nunca crea la cuenta, la persona invitada sigue eligiendo su propio
 * alias real al aceptar.
 */
export async function createGroupInvitation(
  groupId: string,
  actingUserId: string,
  options: CreateGroupInvitationOptions | string | null = {},
) {
  await requireMembership(groupId, actingUserId);
  await enforceInvitationCreateRateLimit(actingUserId);

  // Compatibilidad: admite el uso previo (tercer parametro = suggestedAlias suelto).
  const normalized: CreateGroupInvitationOptions = typeof options === "string" || options === null ? { suggestedAlias: options } : options;

  const [invitation] = await db
    .insert(groupInvitations)
    .values({
      groupId,
      token: generateToken(),
      createdBy: actingUserId,
      suggestedAlias: normalized.suggestedAlias?.trim() || null,
      externalProvider: normalized.externalProvider ?? null,
      externalParticipantId: normalized.externalParticipantId ?? null,
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    })
    .returning();
  await recordInvitationCreateAttempt(actingUserId);
  if (!invitation) throw new AppError(500, "No se pudo crear la invitacion");
  return invitation;
}

export async function listGroupInvitations(groupId: string, actingUserId: string) {
  await requireMembership(groupId, actingUserId);
  return db
    .select({
      id: groupInvitations.id,
      token: groupInvitations.token,
      suggestedAlias: groupInvitations.suggestedAlias,
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

/**
 * Revoca (borra) una invitacion personal pendiente antes de que se use,
 * para poder retirar un enlace generado por error o ya innecesario (ej.
 * uno de los generados automaticamente al importar de Splitwise para un
 * participante que ya no interesa invitar). Permitido a quien la creo o
 * a un administrador del grupo -mismo criterio que editar/borrar un
 * gasto (Fase 4)-, nunca a cualquier miembro sin relacion con ella.
 *
 * Solo se pueden revocar invitaciones sin usar: una ya aceptada es
 * historico (la cuenta ya existe), no tiene sentido "revocarla" y
 * `listGroupInvitations` tampoco la devuelve.
 */
export async function revokeGroupInvitation(groupId: string, actingUserId: string, invitationId: string) {
  const membership = await requireMembership(groupId, actingUserId);

  const [invitation] = await db
    .select()
    .from(groupInvitations)
    .where(and(eq(groupInvitations.id, invitationId), eq(groupInvitations.groupId, groupId)))
    .limit(1);
  if (!invitation) {
    throw new AppError(404, "Invitacion no encontrada", "invitation_not_found");
  }
  if (invitation.usedAt) {
    throw new AppError(409, "Esta invitacion ya ha sido utilizada, no se puede revocar", "invitation_already_used");
  }

  const canRevoke = membership.role === "admin" || invitation.createdBy === actingUserId;
  if (!canRevoke) {
    throw new AppError(
      403,
      "Solo quien creo la invitacion o un administrador del grupo pueden revocarla",
      "forbidden_invitation_revoke",
    );
  }

  return db.transaction(async (tx) => {
    const deleted = await tx.delete(groupInvitations).where(eq(groupInvitations.id, invitationId)).returning();
    const removed = deleted[0];
    if (!removed) throw new AppError(404, "Invitacion no encontrada", "invitation_not_found");

    await recordAuditLog(tx, {
      actorUserId: actingUserId,
      action: "delete",
      entityType: "group_invitation",
      entityId: removed.id,
      groupId,
      beforeData: removed,
    });

    return removed;
  });
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

  return {
    groupName: row.groupName,
    expiresAt: row.invitation.expiresAt,
    suggestedAlias: row.invitation.suggestedAlias,
  };
}

/**
 * Acepta una invitacion: crea el usuario (alias + contrasena elegidos por
 * la persona invitada) y lo anade como miembro del grupo, todo en una
 * transaccion con la fila de invitacion bloqueada (`for("update")`) para
 * evitar que el mismo enlace de un solo uso se consuma dos veces en
 * paralelo.
 */
export async function acceptGroupInvitation(token: string, alias: string, password: string) {
  await enforceInvitationAcceptRateLimit();
  try {
    return await db.transaction(async (tx) => {
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

      let membershipId: string | undefined;
      try {
        const [membership] = await tx
          .insert(memberships)
          .values({ groupId: group.id, userId: user.id, role: "member" })
          .returning();
        membershipId = membership?.id;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new AppError(409, "Ya eres miembro de este grupo", "already_member");
        }
        throw error;
      }

      await addUserToAllGroupSubgroups(tx, group.id, user.id);

      if (membershipId) {
        await recordAuditLog(tx, {
          actorUserId: user.id,
          action: "create",
          entityType: "membership",
          entityId: membershipId,
          groupId: group.id,
          afterData: { groupId: group.id, userId: user.id, role: "member", viaInvitation: true },
        });
      }

      await tx
        .update(groupInvitations)
        .set({ usedAt: new Date(), usedByUserId: user.id })
        .where(eq(groupInvitations.id, invitation.id));

      /**
       * Fase 11 ampliada: si esta invitacion se genero automaticamente
       * para un participante externo sin cuenta Gatso (ej. Splitwise,
       * ver `job-service.ts`), registra la correspondencia externo <->
       * usuario Gatso real ahora que ya existe. Asi, una nueva ejecucion
       * de la importacion resuelve a esta persona automaticamente sin
       * que el administrador tenga que remapearla a mano. Se usa
       * `onConflictDoNothing` (mismo criterio que `recordEntityMapping`)
       * por si el mismo participante ya quedo mapeado por otra via
       * mientras la invitacion estaba pendiente.
       */
      if (invitation.externalProvider && invitation.externalParticipantId) {
        await tx
          .insert(externalEntityMappings)
          .values({
            provider: invitation.externalProvider,
            entityType: "user",
            externalId: invitation.externalParticipantId,
            gatsoId: user.id,
            createdByJobId: null,
          })
          .onConflictDoNothing();
      }

      const sessionToken = await createSessionToken({ userId: user.id, alias: user.alias });
      await setSessionCookie(sessionToken);

      return { user, group };
    });
  } finally {
    await recordInvitationAcceptAttempt();
  }
}
