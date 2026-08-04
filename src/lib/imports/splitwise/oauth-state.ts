import { cookies } from "next/headers";
import { generateCsrfToken, timingSafeEqualString } from "@/lib/auth/csrf";

/**
 * Proteccion CSRF del flujo OAuth (Fase 11): evita que un atacante inicie
 * su propia autorizacion en Splitwise y enganie a la victima para que
 * visite la URL de callback con el `code` del atacante, vinculando la
 * cuenta de Splitwise del atacante a la sesion Gatso de la victima.
 *
 * Patron double-submit (mismo criterio que `src/lib/auth/csrf.ts`): se
 * genera un valor aleatorio, se guarda en una cookie httpOnly de corta
 * duracion Y se envia como parametro `state` a Splitwise; en el callback
 * se exige que ambos coincidan. La cookie se borra tras el primer uso
 * (de un solo uso) y expira sola a los 10 minutos si el usuario nunca
 * vuelve del proveedor.
 */
export const OAUTH_STATE_COOKIE_NAME = "gatso_splitwise_oauth_state";
const STATE_MAX_AGE_SECONDS = 10 * 60;

export function createOAuthState(): string {
  return generateCsrfToken();
}

export async function setOAuthStateCookie(state: string): Promise<void> {
  const store = await cookies();
  store.set(OAUTH_STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: STATE_MAX_AGE_SECONDS,
  });
}

/** Lee el valor de la cookie de estado y la borra inmediatamente (un solo uso, se llame o no despues `verifyOAuthState`). */
export async function consumeOAuthStateCookie(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(OAUTH_STATE_COOKIE_NAME)?.value ?? null;
  store.delete(OAUTH_STATE_COOKIE_NAME);
  return value;
}

export function verifyOAuthState(cookieValue: string | null, returnedState: string | null): boolean {
  if (!cookieValue || !returnedState) return false;
  return timingSafeEqualString(cookieValue, returnedState);
}
