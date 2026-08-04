import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AppError } from "@/lib/errors";

/**
 * Cifrado simetrico (AES-256-GCM) para secretos que deben guardarse en
 * reposo pero nunca en texto plano (Fase 11: tokens OAuth de Splitwise en
 * `external_connections`). Un unico formato de salida
 * (`v1:<iv_base64url>:<authTag_base64url>:<ciphertext_base64url>`) para
 * poder rotar el esquema en el futuro sin romper filas ya cifradas con la
 * version anterior.
 *
 * Lee `process.env.IMPORT_ENCRYPTION_KEY` directamente (no via
 * `src/lib/env.ts`) para que este modulo sea testeable de forma pura sin
 * necesitar `DATABASE_URL`/`AUTH_SECRET` configurados (mismo criterio que
 * `src/lib/money.ts`); las rutas que usan cifrado real siguen validando
 * la variable de entorno completa a traves de `env.ts` en el resto de la
 * aplicacion.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(): Buffer {
  const raw = process.env.IMPORT_ENCRYPTION_KEY;
  if (!raw) {
    throw new AppError(
      500,
      "La importacion no esta configurada (falta IMPORT_ENCRYPTION_KEY)",
      "import_not_configured",
    );
  }
  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) {
    throw new AppError(
      500,
      "IMPORT_ENCRYPTION_KEY debe ser una clave hexadecimal de 32 bytes (64 caracteres)",
      "import_not_configured",
    );
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${authTag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

export function decryptSecret(payload: string): string {
  const key = getKey();
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new AppError(500, "Formato de secreto cifrado invalido", "invalid_encrypted_secret");
  }
  const [, ivPart, authTagPart, ciphertextPart] = parts;
  const iv = Buffer.from(ivPart!, "base64url");
  const authTag = Buffer.from(authTagPart!, "base64url");
  const ciphertext = Buffer.from(ciphertextPart!, "base64url");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
