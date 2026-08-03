import type { Membership } from "@/db/schema/memberships";

/**
 * Elige que miembro restante deberia ascender a administrador cuando el
 * unico administrador de un grupo lo abandona (Fase 8): el miembro con
 * mas antiguedad (`joinedAt` mas bajo), para que el criterio sea
 * predecible y no dependa del orden devuelto por la base de datos.
 *
 * Vive en su propio fichero (sin importar `@/db`) para poder testearla
 * como funcion pura sin necesidad de `DATABASE_URL` ni conexion real a la
 * base de datos, siguiendo el mismo patron que `src/lib/money.ts` o
 * `src/lib/expenses/split-strategies.ts`.
 */
export function pickAdminReplacement(otherMembers: Membership[]): Membership | null {
  if (otherMembers.length === 0) return null;
  return otherMembers.reduce((oldest, current) =>
    current.joinedAt.getTime() < oldest.joinedAt.getTime() ? current : oldest,
  );
}
