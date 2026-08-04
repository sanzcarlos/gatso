import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getSplitwiseOAuthConfig, getRedirectUri } from "@/lib/imports/splitwise/config";
import { buildSplitwiseAuthorizeUrl } from "@/lib/imports/splitwise/client";
import { createOAuthState, setOAuthStateCookie } from "@/lib/imports/splitwise/oauth-state";

export const runtime = "nodejs";

/**
 * Inicia el flujo OAuth con Splitwise (Fase 11): redirige al usuario a
 * la pagina de autorizacion de Splitwise con un `state` de un solo uso
 * (ver `oauth-state.ts`) para poder verificarlo en el callback.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const config = getSplitwiseOAuthConfig();
    const state = createOAuthState();
    await setOAuthStateCookie(state);
    const redirectUri = getRedirectUri(request.url);
    const authorizeUrl = buildSplitwiseAuthorizeUrl(config, state, redirectUri);
    return NextResponse.redirect(authorizeUrl);
  } catch {
    return NextResponse.redirect(new URL("/settings/import/splitwise?error=not_configured", request.url));
  }
}
