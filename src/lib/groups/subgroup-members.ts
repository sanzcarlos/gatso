export interface SubgroupMemberOption {
  userId: string;
  displayName: string;
}

/** Miembros del grupo que todavia no pertenecen al subgrupo. */
export function getAvailableSubgroupMembers<T extends SubgroupMemberOption>(
  groupMembers: T[],
  subgroupMembers: SubgroupMemberOption[],
): T[] {
  const subgroupUserIds = new Set(subgroupMembers.map((member) => member.userId));
  return groupMembers.filter((member) => !subgroupUserIds.has(member.userId));
}
