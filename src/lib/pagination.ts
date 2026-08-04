/**
 * Paginacion por cursor generica (Backlog: "Anadir paginacion por cursor a
 * gastos y notificaciones; paginacion y filtros por accion/entidad al
 * visor de auditoria"). El cursor es un objeto arbitrario serializado a
 * base64url (opaco para el cliente, solo debe reenviarse tal cual); evita
 * los problemas de la paginacion por offset (resultados duplicados/saltados
 * si se insertan filas nuevas entre paginas) porque cada pagina se calcula
 * respecto a la ultima fila real de la pagina anterior, no a una posicion
 * numerica.
 */

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;

/** Serializa un cursor (objeto plano JSON-serializable) a un string opaco para la URL. */
export function encodeCursor(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

/** Deserializa un cursor recibido del cliente; nunca lanza, devuelve `null` si es invalido. */
export function decodeCursor<T>(cursor: string | null | undefined): T | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" ? (parsed as T) : null;
  } catch {
    return null;
  }
}

/** Convierte el parametro `?limit=` de una query string en un entero acotado y valido. */
export function clampLimit(raw: string | null | undefined, fallback = DEFAULT_PAGE_LIMIT): number {
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), MAX_PAGE_LIMIT);
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
