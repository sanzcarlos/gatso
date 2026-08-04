import argon2 from "argon2";

/**
 * Parametros Argon2id alineados con las recomendaciones OWASP (memoria >=
 * 19 MiB, 2 iteraciones, 1 hilo) como compromiso razonable para funciones
 * serverless con limites de memoria/CPU en Vercel.
 */
const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashSecret(secret: string): Promise<string> {
  return argon2.hash(secret, HASH_OPTIONS);
}

export async function verifySecret(hash: string, secret: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, secret);
  } catch {
    return false;
  }
}

/**
 * Hash Argon2id estatico y valido (de un secreto fijo, no reutilizado en
 * ningun sitio) usado como "senuelo" para que las rutas de login y
 * recuperacion tarden aproximadamente lo mismo exista o no el usuario,
 * mitigando ataques de temporizacion que revelarian si un usuario existe.
 */
export const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQxMjM0NTY3OA$3s2Kn8k8mvVwJv0kj7hFhrx8XnU0j+r2W7xzFbG5m3Y";
