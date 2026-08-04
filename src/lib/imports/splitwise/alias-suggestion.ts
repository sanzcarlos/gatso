/**
 * Sugiere un alias valido para Gatso a partir de un nombre de Splitwise
 * (Fase 11: invitar a un participante sin cuenta Gatso, ver
 * `job-service.ts`/`splitwise-import-client.tsx`). Es solo una PROPUESTA
 * prellenada -y editable- en el formulario de aceptacion de la
 * invitacion (`group_invitations.suggestedAlias`); nunca crea la cuenta
 * por si sola ni se valida contra el UNIQUE de `users.alias` aqui (eso lo
 * hace `createUserWithAlias` cuando la persona invitada confirma su
 * propio alias real al aceptar).
 *
 * Reglas de saneado (deben poder producir siempre un resultado que
 * cumpla `aliasSchema`: 3-32 caracteres, solo `[a-zA-Z0-9_-]`):
 * - Quita diacriticos (normalizacion NFD + eliminar marcas combinantes)
 *   para que "Álvaro" -> "Alvaro" en vez de perder la A.
 *   Sin esta normalizacion previa, el filtro de caracteres invalidos de
 *   abajo eliminaria la "Á" entera.
 * - Sustituye cualquier caracter fuera de `[a-zA-Z0-9_-]` por "_".
 * - Colapsa guiones bajos repetidos y recorta los de los extremos.
 * - Si el resultado queda vacio o por debajo del minimo de 3 caracteres,
 *   usa un sufijo aleatorio corto para garantizar unicidad razonable sin
 *   depender del nombre original.
 */
const MIN_ALIAS_LENGTH = 3;
const MAX_ALIAS_LENGTH = 32;

export function suggestAliasFromDisplayName(displayName: string): string {
  const withoutDiacritics = displayName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const sanitized = withoutDiacritics
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "")
    .slice(0, MAX_ALIAS_LENGTH);

  if (sanitized.length >= MIN_ALIAS_LENGTH) return sanitized;

  const randomSuffix = Math.random().toString(36).slice(2, 8);
  const base = sanitized || "usuario";
  return `${base}_${randomSuffix}`.slice(0, MAX_ALIAS_LENGTH);
}
