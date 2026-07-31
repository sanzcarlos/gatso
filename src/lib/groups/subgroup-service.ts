import { and, count, eq } from "drizzle-orm";
import { db, groups, subgroups, subgroupMemberships, users } from "@/db";
import type { Tx } from "@/db";
import { AppError } from "@/lib/errors";
import { isUniqueViolation } from "@/lib/db/errors";
import { getMembership, requireMembership } from "./service";
import { GROUP_MAX_SUBGROUPS } from "@/lib/validation/groups";

/**
 * Anade a un usuario a todos los subgrupos existentes de un grupo. Se usa
 * cuando el usuario se une al grupo (via codigo de invitacion o invitacion
 * personal): por diseno, todo miembro del grupo pertenece automaticamente
 * a todos sus subgrupos (que a su vez son solo un filtro de gastos, no un
 * mecanismo de exclusion de acceso). Recibe `tx` para ejecutarse dentro de
 * la misma transaccion que crea la membresia de grupo.
 */
export async function addUserToAllGroupSubgroups(tx: Tx, groupId: string, userId: string) {
  const groupSubgroups = await tx.select({ id: subgroups.id }).from(subgroups).where(eq(subgroups.groupId, groupId));
  if (groupSubgroups.length === 0) return;

  await tx
    .insert(subgroupMemberships)
    .values(groupSubgroups.map((subgroup) => ({ subgroupId: subgroup.id, userId })))
    .onConflictDoNothing();
}

export async function createSubgroup(groupId: string, userId: string, name: string) {
  await requireMembership(groupId, userId);

  return db.transaction(async (tx) => {
    const [group] = await tx.select().from(groups).where(eq(groups.id, groupId)).for("update").limit(1);
    if (!group) throw new AppError(404, "Grupo no encontrado", "group_not_found");

    const [subgroupCountRow] = await tx
      .select({ value: count() })
      .from(subgroups)
      .where(eq(subgroups.groupId, groupId));
    const subgroupCount = subgroupCountRow?.value ?? 0;
    if (subgroupCount >= (group.maxSubgroups ?? GROUP_MAX_SUBGROUPS)) {
      throw new AppError(
        409,
        `El grupo ha alcanzado el limite de ${group.maxSubgroups} subgrupos`,
        "subgroup_limit_reached",
      );
    }

    try {
      const [subgroup] = await tx.insert(subgroups).values({ groupId, name, createdBy: userId }).returning();
      if (!subgroup) throw new AppError(500, "No se pudo crear el subgrupo");
      await tx.insert(subgroupMemberships).values({ subgroupId: subgroup.id, userId });
      return subgroup;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(409, "Ya existe un subgrupo con ese nombre en este grupo", "subgroup_name_taken");
      }
      throw error;
    }
  });
}

export async function listSubgroups(groupId: string, userId: string) {
  await requireMembership(groupId, userId);
  return db.select().from(subgroups).where(eq(subgroups.groupId, groupId));
}

export async function getSubgroupInGroup(groupId: string, subgroupId: string) {
  const [subgroup] = await db
    .select()
    .from(subgroups)
    .where(and(eq(subgroups.id, subgroupId), eq(subgroups.groupId, groupId)))
    .limit(1);
  if (!subgroup) throw new AppError(404, "Subgrupo no encontrado", "subgroup_not_found");
  return subgroup;
}

/** Detalle de un subgrupo (para su pagina propia): datos + miembros con alias. */
export async function getSubgroupDetail(groupId: string, subgroupId: string, userId: string) {
  await requireMembership(groupId, userId);
  const subgroup = await getSubgroupInGroup(groupId, subgroupId);

  const members = await db
    .select({ userId: subgroupMemberships.userId, alias: users.alias })
    .from(subgroupMemberships)
    .innerJoin(users, eq(users.id, subgroupMemberships.userId))
    .where(eq(subgroupMemberships.subgroupId, subgroupId));

  return { subgroup, members };
}

export async function addSubgroupMember(
  groupId: string,
  subgroupId: string,
  actingUserId: string,
  targetUserId: string,
) {
  await requireMembership(groupId, actingUserId);
  await getSubgroupInGroup(groupId, subgroupId);

  const targetMembership = await getMembership(groupId, targetUserId);
  if (!targetMembership) {
    throw new AppError(400, "El usuario no pertenece al grupo", "target_not_group_member");
  }

  try {
    const [row] = await db
      .insert(subgroupMemberships)
      .values({ subgroupId, userId: targetUserId })
      .returning();
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, "El usuario ya es miembro de este subgrupo", "already_subgroup_member");
    }
    throw error;
  }
}

export async function listSubgroupMembers(groupId: string, subgroupId: string, userId: string) {
  await requireMembership(groupId, userId);
  await getSubgroupInGroup(groupId, subgroupId);
  return db
    .select()
    .from(subgroupMemberships)
    .where(eq(subgroupMemberships.subgroupId, subgroupId));
}

export async function removeSubgroupMember(
  groupId: string,
  subgroupId: string,
  actingUserId: string,
  targetUserId: string,
) {
  const actingMembership = await requireMembership(groupId, actingUserId);
  await getSubgroupInGroup(groupId, subgroupId);

  if (actingUserId !== targetUserId && actingMembership.role !== "admin") {
    throw new AppError(
      403,
      "Solo puedes eliminarte a ti mismo o ser administrador del grupo",
      "forbidden_subgroup_removal",
    );
  }

  const deleted = await db
    .delete(subgroupMemberships)
    .where(and(eq(subgroupMemberships.subgroupId, subgroupId), eq(subgroupMemberships.userId, targetUserId)))
    .returning();
  if (deleted.length === 0) {
    throw new AppError(404, "El usuario no es miembro de este subgrupo", "subgroup_member_not_found");
  }
  return deleted[0];
}
