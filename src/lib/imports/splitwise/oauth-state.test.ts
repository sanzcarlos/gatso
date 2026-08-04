import { describe, expect, it } from "vitest";
import { verifyOAuthState } from "./oauth-state";

describe("verifyOAuthState", () => {
  it("acepta cuando la cookie y el state devuelto coinciden", () => {
    expect(verifyOAuthState("abc123", "abc123")).toBe(true);
  });

  it("rechaza cuando no coinciden", () => {
    expect(verifyOAuthState("abc123", "other")).toBe(false);
  });

  it("rechaza si falta la cookie (expirada o ya consumida)", () => {
    expect(verifyOAuthState(null, "abc123")).toBe(false);
  });

  it("rechaza si falta el state devuelto por Splitwise", () => {
    expect(verifyOAuthState("abc123", null)).toBe(false);
  });

  it("rechaza si ambos son null", () => {
    expect(verifyOAuthState(null, null)).toBe(false);
  });
});
