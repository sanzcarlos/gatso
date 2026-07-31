import { and, count, eq } from "drizzle-orm";
import { db, groups, memberships, subgroups, users } from "@/db";
import { AppError } from "@/lib/errors";
import { isUniqueViolation } from "@/lib/db/errors";
import { generateInviteCode } from "./invite-code";
import { addUserToAllGroupSubgroups } from "./subgroup-service";
import { recordAuditLog } from "@/lib/audit/service";
import { GROUP_MAX_MEMBERS } from "@/lib/validation/groups";

const INVITE_CODE_MAX_ATTEMPTS = 5;

export async function createGroup(userId: string, name: string) {
  return db.transaction(async (tx) => {
    for (let attempt = 0; attempt < INVITE_CODE_MAX_ATTEMPTS; attempt++) {
      const inviteCode = generateInviteCode();
      try {
        const [group] = await tx
          .insert(groups)
          .values({ name, inviteCode, createdBy: userId, maxMembers: GROUP_MAX_MEMBERS })
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
  return db.transaction(async (tx) => {
    const [group] = await tx
      .select()
      .from(groups)
      .where(eq(groups.inviteCode, inviteCode))
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
}

export async function listMembers(groupId: string, userId: string) {
  await requireMembership(groupId, userId);
  return db
    .select({
      userId: memberships.userId,
      alias: users.alias,
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
