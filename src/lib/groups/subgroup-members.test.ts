import { describe, expect, it } from "vitest";
import { getAvailableSubgroupMembers } from "./subgroup-members";

describe("getAvailableSubgroupMembers", () => {
  it("ofrece solo miembros del grupo que no estan en el subgrupo", () => {
    const groupMembers = [
      { userId: "user-1", displayName: "Ana", role: "admin" },
      { userId: "user-2", displayName: "Beto", role: "member" },
      { userId: "user-3", displayName: "Celia", role: "member" },
    ];

    expect(getAvailableSubgroupMembers(groupMembers, [groupMembers[0]!, groupMembers[2]!])).toEqual([groupMembers[1]]);
  });
});
