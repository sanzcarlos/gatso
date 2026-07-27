import { customAlphabet } from "nanoid";

// Sin caracteres ambiguos, igual que el codigo de recuperacion: pensado para
// compartirse de palabra o escrito a mano en una invitacion.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const generate = customAlphabet(ALPHABET, 10);

export function generateInviteCode(): string {
  return generate();
}
