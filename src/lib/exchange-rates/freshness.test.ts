import { describe, it, expect } from "vitest";
import { shouldAttemptEcbRefresh, ECB_RETRY_INTERVAL_MS, type EcbFetchAttempt } from "./freshness";

const NOW = new Date("2026-08-03T10:00:00.000Z"); // lunes

describe("shouldAttemptEcbRefresh", () => {
  it("no reintenta si la tasa guardada ya es de hoy", () => {
    expect(
      shouldAttemptEcbRefresh({ latestStoredDate: "2026-08-03", lastAttempt: null, now: NOW }),
    ).toBe(false);
  });

  it("reintenta si nunca se guardo ninguna tasa y nunca se intento antes", () => {
    expect(shouldAttemptEcbRefresh({ latestStoredDate: null, lastAttempt: null, now: NOW })).toBe(true);
  });

  it("reintenta si la tasa guardada es antigua y nunca se intento antes", () => {
    expect(
      shouldAttemptEcbRefresh({ latestStoredDate: "2026-07-31", lastAttempt: null, now: NOW }),
    ).toBe(true);
  });

  it("NO reintenta en fin de semana/festivo si ya se intento hace menos del TTL (evita flood al BCE)", () => {
    const lastAttempt: EcbFetchAttempt = {
      attemptedAt: new Date(NOW.getTime() - ECB_RETRY_INTERVAL_MS / 2).toISOString(),
      status: "success",
    };
    // El BCE lleva sin publicar desde el viernes (2026-07-31), pero ya
    // intentamos hace menos de ECB_RETRY_INTERVAL_MS: no se debe reintentar.
    expect(
      shouldAttemptEcbRefresh({ latestStoredDate: "2026-07-31", lastAttempt, now: NOW }),
    ).toBe(false);
  });

  it("reintenta si el ultimo intento (exitoso o no) supera el TTL", () => {
    const lastAttempt: EcbFetchAttempt = {
      attemptedAt: new Date(NOW.getTime() - ECB_RETRY_INTERVAL_MS - 1).toISOString(),
      status: "error",
      error: "fetch failed",
    };
    expect(
      shouldAttemptEcbRefresh({ latestStoredDate: "2026-07-31", lastAttempt, now: NOW }),
    ).toBe(true);
  });

  it("reintenta un intento fallido reciente igual que uno exitoso reciente (mismo TTL para ambos)", () => {
    const recentError: EcbFetchAttempt = {
      attemptedAt: new Date(NOW.getTime() - 1000).toISOString(),
      status: "error",
    };
    expect(
      shouldAttemptEcbRefresh({ latestStoredDate: "2026-07-31", lastAttempt: recentError, now: NOW }),
    ).toBe(false);
  });
});
