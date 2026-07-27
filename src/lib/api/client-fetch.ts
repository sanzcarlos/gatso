"use client";

import { CSRF_HEADER_NAME, readCsrfToken } from "@/lib/auth/csrf-client";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** fetch envolvente que anade el header CSRF automaticamente en peticiones que mutan estado. */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  if (!SAFE_METHODS.has(method)) {
    const token = readCsrfToken();
    if (token) headers.set(CSRF_HEADER_NAME, token);
  }

  return fetch(path, { ...options, method, headers, credentials: "same-origin" });
}
