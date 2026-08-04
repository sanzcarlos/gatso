import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

const secretKey = new TextEncoder().encode(env.AUTH_SECRET);

/** Duracion de la sesion: 30 dias. */
export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30;

export interface SessionPayload {
  userId: string;
  /**
   * Credencial de acceso (Fase de identidad): no hay flujo de "cambiar
   * username", asi que guardarla en el JWT es seguro y no se vuelve
   * obsoleta. El `displayName` (editable en cualquier momento) NUNCA se
   * guarda aqui a proposito -mismo criterio que `isPlatformAdmin`, que
   * tampoco viaja en el token- para que un cambio de nombre visible
   * surta efecto de inmediato en cualquier pestana abierta sin esperar a
   * que caduque la sesion o se vuelva a iniciar sesion; se consulta en
   * BD donde haga falta mostrarlo (`getSessionDisplayInfo`).
   */
  username: string;
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ userId: payload.userId, username: payload.username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(secretKey);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    if (typeof payload.userId !== "string" || typeof payload.username !== "string") {
      return null;
    }
    return { userId: payload.userId, username: payload.username };
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(env.AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(env.AUTH_COOKIE_NAME);
}

/** Lee y valida la sesion actual desde la cookie httpOnly. Uso en Server Components / Route Handlers. */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(env.AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
