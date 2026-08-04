import { describe, expect, it } from "vitest";
import { buildSplitwiseAuthorizeUrl, SPLITWISE_OAUTH_AUTHORIZE_URL } from "./client";

describe("buildSplitwiseAuthorizeUrl", () => {
  const config = { clientId: "abc123", clientSecret: "secret" };

  it("apunta al endpoint oficial de autorizacion de Splitwise", () => {
    const url = buildSplitwiseAuthorizeUrl(config, "state-value", "https://example.com/callback");
    expect(url.startsWith(SPLITWISE_OAUTH_AUTHORIZE_URL)).toBe(true);
  });

  it("incluye response_type, client_id, redirect_uri y state", () => {
    const url = new URL(buildSplitwiseAuthorizeUrl(config, "state-value", "https://example.com/callback"));
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("abc123");
    expect(url.searchParams.get("redirect_uri")).toBe("https://example.com/callback");
    expect(url.searchParams.get("state")).toBe("state-value");
  });
});
