import { and, count, eq, isNotNull, isNull } from "drizzle-orm";
import { db, groups, memberships, subgroups, users } from "@/db";
import { AppError } from "@/lib/errors";
import { isUniqueViolation } from "@/lib/db/errors";
import { generateInviteCode } from "./invite-code";
import { addUserToAllGroupSubgroups, removeUserFromAllGroupSubgroups } from "./subgroup-service";
import { pickAdminReplacement } from "./admin-replacement";
import { recordAuditLog } from "@/lib/audit/service";
import { requireActiveCurrency } from "@/lib/currencies/service";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { enforceGroupJoinRateLimit, recordGroupJoinAttempt } from "@/lib/rate-limit/service";
import { GROUP_MAX_MEMBERS } from "@/lib/validation/groups";

const INVITE_CODE_MAX_ATTEMPTS = 5;

export async function createGroup(userId: string, name: string, baseCurrencyCode: string = "EUR") {
  await requireActiveCurrency(baseCurrencyCode);

  return db.transaction(async (tx) => {
    for (let attempt = 0; attempt < INVITE_CODE_MAX_ATTEMPTS; attempt++) {
      const inviteCode = generateInviteCode();
      try {
        const [group] = await tx
          .insert(groups)
          .values({ name, inviteCode, createdBy: userId, maxMembers: GROUP_MAX_MEMBERS, baseCurrencyCode })
          .returning();
        if (!group) throw new AppError(500, "No se pudo crear el grupo");
        const [membership] = await tx
          .insert(memberships)
          .values({ groupId: group.id, userId, role: "admin" })
          .returning();
        await recordAuditLog(tx, {
          actorUserId: userId,
          action: "create",
          entityType: "group",
          entityId: group.id,
          groupId: group.id,
          afterData: group,
        });
        if (membership) {
          await recordAuditLog(tx, {
            actorUserId: userId,
            action: "create",
            entityType: "membership",
            entityId: membership.id,
            groupId: group.id,
            afterData: membership,
          });
        }
        return group;
      } catch (error) {
        if (isUniqueViolation(error)) {
          continue;
        }
        throw error;
      }
    }
    throw new AppError(500, "No se pudo generar un codigo de invitacion unico", "invite_code_exhausted");
  });
}

export async function getMembership(groupId: string, userId: string) {
  const [membership] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.groupId, groupId), eq(memberships.userId, userId)))
    .limit(1);
  return membership ?? null;
}

export async function requireMembership(groupId: string, userId: string) {
  const membership = await getMembership(groupId, userId);
  if (!membership) throw new AppError(403, "No perteneces a este grupo", "not_a_member");
  return membership;
}

export async function requireGroupAdmin(groupId: string, userId: string) {
  const membership = await requireMembership(groupId, userId);
  if (membership.role !== "admin") {
    throw new AppError(403, "Requiere permisos de administrador del grupo", "not_group_admin");
  }
  return membership;
}

export async function listUserGroups(userId: string) {
  return db
    .select({ group: groups, role: memberships.role, joinedAt: memberships.joinedAt })
    .from(memberships)
    .innerJoin(groups, eq(memberships.groupId, groups.id))
    .where(eq(memberships.userId, userId));
}

export async function getGroupDetail(groupId: string, userId: string) {
  await requireMembership(groupId, userId);

  const [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  if (!group) throw new AppError(404, "Grupo no encontrado", "group_not_found");

  const [memberCountRow] = await db
    .select({ value: count() })
    .from(memberships)
    .where(eq(memberships.groupId, groupId));
  const [subgroupCountRow] = await db
    .select({ value: count() })
    .from(subgroups)
    .where(eq(subgroups.groupId, groupId));

  return {
    group,
    memberCount: memberCountRow?.value ?? 0,
    subgroupCount: subgroupCountRow?.value ?? 0,
  };
}

export async function updateGroupName(groupId: string, userId: string, name: string) {
  await requireGroupAdmin(groupId, userId);
  return db.transaction(async (tx) => {
    const [previousGroup] = await tx.select().from(groups).where(eq(groups.id, groupId)).limit(1);
    if (!previousGroup) throw new AppError(404, "Grupo no encontrado", "group_not_found");

    const [group] = await tx.update(groups).set({ name }).where(eq(groups.id, groupId)).returning();
    if (!group) throw new AppError(404, "Grupo no encontrado", "group_not_found");

    await recordAuditLog(tx, {
      actorUserId: userId,
      action: "update",
      entityType: "group",
      entityId: group.id,
      groupId: group.id,
      beforeData: previousGroup,
      afterData: group,
    });

    return group;
  });
}

export async function joinGroupByInviteCode(userId: string, inviteCode: string) {
  await enforceGroupJoinRateLimit(userId);
  try {
    return await db.transaction(async (tx) => {
      const [group] = await tx
        .select()
        .from(groups)
        .where(and(eq(groups.inviteCode, inviteCode), isNull(groups.archivedAt)))
        .for("update")
        .limit(1);
      if (!group) throw new AppError(404, "Codigo de invitacion invalido", "invalid_invite_code");

      const existing = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .where(and(eq(memberships.groupId, group.id), eq(memberships.userId, userId)))
        .limit(1);
      if (existing.length > 0) {
        throw new AppError(409, "Ya eres miembro de este grupo", "already_member");
      }

      const [memberCountRow] = await tx
        .select({ value: count() })
        .from(memberships)
        .where(eq(memberships.groupId, group.id));
      const memberCount = memberCountRow?.value ?? 0;
      if (memberCount >= group.maxMembers) {
        throw new AppError(
          409,
          `El grupo ha alcanzado el limite de ${group.maxMembers} miembros`,
          "group_full",
        );
      }

      const [membership] = await tx
        .insert(memberships)
        .values({ groupId: group.id, userId, role: "member" })
        .returning();

      await addUserToAllGroupSubgroups(tx, group.id, userId);

      if (membership) {
        await recordAuditLog(tx, {
          actorUserId: userId,
          action: "create",
          entityType: "membership",
          entityId: membership.id,
          groupId: group.id,
          afterData: membership,
        });
      }

      return { group, membership };
    });
  } finally {
    await recordGroupJoinAttempt(userId);
  }
}

export async function listMembers(groupId: string, userId: string) {
  await requireMembership(groupId, userId);
  return db
    .select({
      userId: memberships.userId,
      displayName: users.displayName,
      role: memberships.role,
      joinedAt: memberships.joinedAt,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.groupId, groupId));
}

export async function removeMember(groupId: string, actingUserId: string, targetUserId: string) {
  await requireGroupAdmin(groupId, actingUserId);
  if (actingUserId === targetUserId) {
    throw new AppError(
      400,
      "No puedes eliminarte a ti mismo del grupo mediante esta accion",
      "cannot_remove_self",
    );
  }
  return db.transaction(async (tx) => {
    await removeUserFromAllGroupSubgroups(tx, groupId, targetUserId);

    const deleted = await tx
      .delete(memberships)
      .where(and(eq(memberships.groupId, groupId), eq(memberships.userId, targetUserId)))
      .returning();
    if (deleted.length === 0) {
      throw new AppError(404, "El usuario no es miembro de este grupo", "member_not_found");
    }
    const removed = deleted[0];
    if (removed) {
      await recordAuditLog(tx, {
        actorUserId: actingUserId,
        action: "delete",
        entityType: "membership",
        entityId: removed.id,
        groupId,
        beforeData: removed,
      });
    }
    return removed;
  });
}

/**
 * Un usuario abandona un grupo voluntariamente (Fase 8), a diferencia de
 * `removeMember` (expulsion por un administrador, no permite
 * autoeliminarse). Los gastos ya existentes del usuario (como pagador,
 * creador o participante de un reparto) NO se borran ni se modifican: solo
 * dejan de existir en `memberships`, por lo que las consultas de gastos
 * (`src/lib/expenses/service.ts`) detectan la ausencia de esa fila para
 * mostrar al usuario con la indicacion de "ha abandonado el grupo" en vez
 * de ocultarlo o borrar su historial.
 *
 * Si quien abandona es el unico administrador del grupo y quedan otros
 * miembros, se asciende automaticamente al miembro mas antiguo restante
 * (`pickAdminReplacement`) para que el grupo nunca quede sin
 * administrador mientras tenga miembros.
 *
 * Si es el ULTIMO miembro del grupo (Backlog: "definir la politica para
 * grupos con cero miembros"), ya no se borra el grupo de inmediato: se
 * ARCHIVA (`archivedAt = now()`), lo que invalida su codigo de invitacion
 * sin necesidad de regenerarlo (`joinGroupByInviteCode` ignora los grupos
 * archivados) y deja grupo, subgrupos, gastos y liquidaciones intactos.
 * Un administrador de plataforma puede restaurarlo desde `/admin/groups`
 * (`restoreArchivedGroup`) mientras siga archivado; pasado el periodo de
 * retencion configurado, `cleanupArchivedGroups`
 * (`src/lib/retention/service.ts`) lo borra de forma definitiva
 * (eliminacion diferida), aprovechando entonces los `onDelete: "cascade"`
 * del esquema. El evento de archivado se audita con `groupId: null` (en
 * vez del `groupId` del propio grupo): sin miembros, nadie podria verlo
 * nunca en la auditoria por grupo (`requireGroupAdmin` exige membresia),
 * asi que se hace visible directamente en la auditoria de plataforma
 * (`getPlatformAuditLog`, que solo lista entradas con `groupId IS NULL`),
 * igual que antes ocurria automaticamente con el borrado en cascada.
 *
 * La fila de `groups` se bloquea (`for("update")`) antes que las de
 * `memberships`, siguiendo el mismo orden que `joinGroupByInviteCode`:
 * evita que alguien se una al grupo justo entre que se comprueba que no
 * quedan mas miembros y que se ejecuta el archivado (ambas operaciones
 * compiten por el mismo lock de fila, por lo que se serializan).
 */
export async function leaveGroup(groupId: string, userId: string) {
  const membership = await requireMembership(groupId, userId);

  return db.transaction(async (tx) => {
    const [group] = await tx.select().from(groups).where(eq(groups.id, groupId)).for("update").limit(1);
    if (!group) throw new AppError(404, "Grupo no encontrado", "group_not_found");

    const allMembers = await tx
      .select()
      .from(memberships)
      .where(eq(memberships.groupId, groupId))
      .for("update");

    const otherMembers = allMembers.filter((m) => m.userId !== userId);

    if (otherMembers.length === 0) {
      const [archivedGroup] = await tx
        .update(groups)
        .set({ archivedAt: new Date() })
        .where(eq(groups.id, groupId))
        .returning();
      if (!archivedGroup) throw new AppError(404, "Grupo no encontrado", "group_not_found");

      await recordAuditLog(tx, {
        actorUserId: userId,
        action: "update",
        entityType: "group",
        entityId: group.id,
        groupId: null,
        beforeData: { ...group, leftVoluntarily: true, archivedBecauseLastMember: true },
        afterData: archivedGroup,
      });

      return { groupArchived: true as const, membership };
    }

    if (membership.role === "admin") {
      const remainingAdmins = otherMembers.filter((m) => m.role === "admin");
      if (remainingAdmins.length === 0) {
        const promoted = pickAdminReplacement(otherMembers);
        if (promoted) {
          const [updatedMembership] = await tx
            .update(memberships)
            .set({ role: "admin" })
            .where(eq(memberships.id, promoted.id))
            .returning();
          if (updatedMembership) {
            await recordAuditLog(tx, {
              actorUserId: userId,
              action: "update",
              entityType: "membership",
              entityId: updatedMembership.id,
              groupId,
              beforeData: promoted,
              afterData: updatedMembership,
            });
          }
        }
      }
    }

    await removeUserFromAllGroupSubgroups(tx, groupId, userId);

    const deleted = await tx
      .delete(memberships)
      .where(and(eq(memberships.groupId, groupId), eq(memberships.userId, userId)))
      .returning();
    const removed = deleted[0];
    if (!removed) throw new AppError(404, "El usuario no es miembro de este grupo", "member_not_found");

    await recordAuditLog(tx, {
      actorUserId: userId,
      action: "delete",
      entityType: "membership",
      entityId: removed.id,
      groupId,
      beforeData: { ...removed, leftVoluntarily: true },
    });

    return { groupArchived: false as const, membership: removed };
  });
}

/**
 * Grupos archivados (sin miembros, ver `leaveGroup`), solo para
 * administradores de plataforma: permite decidir si restaurarlos antes de
 * que `cleanupArchivedGroups` los borre de forma definitiva.
 */
export async function listArchivedGroups(actingUserId: string) {
  await requirePlatformAdmin(actingUserId);
  return db.select().from(groups).where(isNotNull(groups.archivedAt)).orderBy(groups.archivedAt);
}

/**
 * Restaura un grupo archivado (`archivedAt = NULL`) antes de que la
 * limpieza diferida lo borre. El grupo vuelve a ser accesible con su
 * mismo codigo de invitacion (nunca se modifico al archivar), pero sigue
 * sin ningun miembro: quien lo restaura debe unirse de nuevo con ese
 * codigo para poder verlo o gestionarlo. Igual que el archivado, se
 * audita con `groupId: null` para que quede visible en la auditoria de
 * plataforma en vez de perderse (nadie tiene membresia para consultar la
 * auditoria propia del grupo).
 */
export async function restoreArchivedGroup(actingUserId: string, groupId: string) {
  await requirePlatformAdmin(actingUserId);

  return db.transaction(async (tx) => {
    const [previousGroup] = await tx.select().from(groups).where(eq(groups.id, groupId)).limit(1);
    if (!previousGroup) throw new AppError(404, "Grupo no encontrado", "group_not_found");
    if (!previousGroup.archivedAt) {
      throw new AppError(409, "El grupo no esta archivado", "group_not_archived");
    }

    const [restored] = await tx.update(groups).set({ archivedAt: null }).where(eq(groups.id, groupId)).returning();
    if (!restored) throw new AppError(404, "Grupo no encontrado", "group_not_found");

    await recordAuditLog(tx, {
      actorUserId: actingUserId,
      action: "update",
      entityType: "group",
      entityId: restored.id,
      groupId: null,
      beforeData: previousGroup,
      afterData: restored,
    });

    return restored;
  });
}
