import { describe, it, expect } from "vitest";
import { pickAdminReplacement } from "./admin-replacement";
import type { Membership } from "@/db/schema/memberships";

function membership(overrides: Partial<Membership>): Membership {
  return {
    id: overrides.id ?? "00000000-0000-0000-0000-000000000000",
    groupId: overrides.groupId ?? "11111111-1111-1111-1111-111111111111",
    userId: overrides.userId ?? "22222222-2222-2222-2222-222222222222",
    role: overrides.role ?? "member",
    joinedAt: overrides.joinedAt ?? new Date("2026-01-01T00:00:00Z"),
  };
}

describe("pickAdminReplacement", () => {
  it("devuelve null si no hay otros miembros", () => {
    expect(pickAdminReplacement([])).toBeNull();
  });

  it("elige al miembro con mayor antiguedad (joinedAt mas bajo)", () => {
    const oldest = membership({ id: "a", joinedAt: new Date("2026-01-01T00:00:00Z") });
    const newer = membership({ id: "b", joinedAt: new Date("2026-02-01T00:00:00Z") });
    const newest = membership({ id: "c", joinedAt: new Date("2026-03-01T00:00:00Z") });

    expect(pickAdminReplacement([newer, oldest, newest])).toEqual(oldest);
  });

  it("funciona con un unico miembro restante", () => {
    const only = membership({ id: "only" });
    expect(pickAdminReplacement([only])).toEqual(only);
  });
});
