import { customAlphabet } from "nanoid";

// Sin caracteres ambiguos (0/O, 1/I/L) para reducir errores al transcribir a mano.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const generateRaw = customAlphabet(ALPHABET, 20);

/** Genera un codigo de recuperacion legible, ej. "ABCD-EFGH-JKMN-PQRS-TUVW". */
export function generateRecoveryCode(): string {
  const raw = generateRaw();
  return raw.match(/.{1,4}/g)!.join("-");
}

/** Normaliza un codigo introducido por el usuario antes de hashear/comparar. */
export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
}
