import { randomBytes } from "node:crypto";

export { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "./csrf-constants";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Genera un token CSRF opaco de 256 bits. */
export function generateCsrfToken(): string {
  return randomBytes(32).toString("hex");
}

export function isSafeMethod(method: string): boolean {
  return SAFE_METHODS.has(method.toUpperCase());
}

/** Comparacion en tiempo constante para evitar timing attacks al validar el token. */
export function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
