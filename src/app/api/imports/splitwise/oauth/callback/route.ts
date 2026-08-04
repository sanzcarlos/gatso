import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getSplitwiseOAuthConfig, getRedirectUri } from "@/lib/imports/splitwise/config";
import { exchangeSplitwiseCodeForToken, SplitwiseClient } from "@/lib/imports/splitwise/client";
import { consumeOAuthStateCookie, verifyOAuthState } from "@/lib/imports/splitwise/oauth-state";
import { saveSplitwiseConnection } from "@/lib/imports/splitwise/connection-service";

export const runtime = "nodejs";

const SETTINGS_PATH = "/settings/import/splitwise";

function redirectWithError(requestUrl: string, code: string): NextResponse {
  return NextResponse.redirect(new URL(`${SETTINGS_PATH}?error=${code}`, requestUrl));
}

/**
 * Callback OAuth de Splitwise (Fase 11): verifica el `state` de un solo
 * uso (double-submit contra la cookie fijada en `oauth/start`), cambia el
 * `code` por un token de acceso y guarda la conexion cifrada. Nunca
 * expone el token al navegador (redirige sin incluirlo en la URL).
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const cookieState = await consumeOAuthStateCookie();

  if (oauthError) return redirectWithError(request.url, "access_denied");
  if (!code) return redirectWithError(request.url, "missing_code");
  if (!verifyOAuthState(cookieState, returnedState)) return redirectWithError(request.url, "invalid_state");

  try {
    const config = getSplitwiseOAuthConfig();
    const redirectUri = getRedirectUri(request.url);
    const token = await exchangeSplitwiseCodeForToken(config, code, redirectUri);

    const client = new SplitwiseClient(token.access_token);
    const currentUser = await client.getCurrentUser();

    await saveSplitwiseConnection(session.userId, token, String(currentUser.user.id));

    return NextResponse.redirect(new URL(`${SETTINGS_PATH}?connected=1`, request.url));
  } catch {
    return redirectWithError(request.url, "connection_failed");
  }
}
