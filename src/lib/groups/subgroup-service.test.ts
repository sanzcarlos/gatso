import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import { buildSubgroupMembershipRows } from "./subgroup-service";

describe("buildSubgroupMembershipRows", () => {
  it("asocia el nuevo subgrupo con todos los miembros del grupo", () => {
    expect(buildSubgroupMembershipRows("subgroup-1", ["user-1", "user-2", "user-3"])).toEqual([
      { subgroupId: "subgroup-1", userId: "user-1" },
      { subgroupId: "subgroup-1", userId: "user-2" },
      { subgroupId: "subgroup-1", userId: "user-3" },
    ]);
  });
});
