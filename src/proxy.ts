import { NextResponse, type NextRequest } from "next/server";
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  generateCsrfToken,
  isSafeMethod,
  timingSafeEqualString,
} from "@/lib/auth/csrf";

/**
 * Proxy (antes "middleware") de Next.js 16. Se ejecuta en runtime Node.js
 * por defecto (desde v15.5 estable), lo que permite usar `node:crypto`
 * directamente para el token CSRF.
 *
 * Estrategia: double-submit cookie.
 * 1. Si no existe cookie CSRF, se genera y se fija (no-httpOnly, legible
 *    por JS para poder reenviarla en el header en el siguiente request).
 * 2. Para metodos que mutan estado sobre /api/*, se exige que el header
 *    `x-csrf-token` coincida con el valor de la cookie.
 *
 * Nota: esto requiere que el cliente visite al menos una pagina (GET) antes
 * de poder hacer un POST/PUT/PATCH/DELETE, para recibir la cookie CSRF.
 */
export default function proxy(request: NextRequest) {
  const existingToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  const response = NextResponse.next();

  if (!existingToken) {
    response.cookies.set(CSRF_COOKIE_NAME, generateCsrfToken(), {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
  }

  const isApiRoute = request.nextUrl.pathname.startsWith("/api");
  if (isApiRoute && !isSafeMethod(request.method)) {
    const headerToken = request.headers.get(CSRF_HEADER_NAME);
    if (!existingToken || !headerToken || !timingSafeEqualString(existingToken, headerToken)) {
      return NextResponse.json({ error: "Token CSRF invalido o ausente" }, { status: 403 });
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
