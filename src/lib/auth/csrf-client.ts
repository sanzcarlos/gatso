"use client";

import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "./csrf-constants";

/**
 * Lee el token CSRF de la cookie no-httpOnly puesta por proxy.ts (patron
 * double-submit cookie) para reenviarlo en el header de peticiones que
 * mutan estado (POST/PUT/PATCH/DELETE) desde el cliente.
 */
export function readCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE_NAME}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export { CSRF_HEADER_NAME };
