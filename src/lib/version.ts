import packageJson from "../../package.json";

/**
 * Informacion de version/despliegue para diagnostico (pagina publica
 * `/version` y `GET /api/version`): permite saber que version esta
 * desplegada en cada entorno sin depender de acceso a la base de datos ni
 * a la consola de Vercel.
 *
 * `appVersion` viene de `package.json` (siempre disponible, tanto en local
 * como en cualquier despliegue). El resto de campos vienen de variables de
 * entorno de sistema de Vercel (verificado contra la documentacion oficial,
 * "System Environment Variables"):
 *
 * - `VERCEL_ENV`, `VERCEL_REGION`: disponibles automaticamente sin
 *   configuracion adicional en cualquier proyecto desplegado en Vercel.
 * - `VERCEL_GIT_COMMIT_SHA`/`_REF`/`_MESSAGE` y `VERCEL_DEPLOYMENT_ID`:
 *   requieren marcar la casilla "Enable access to System Environment
 *   Variables" en Project Settings -> Environment Variables (documentado
 *   en el README); si no esta marcada, o en desarrollo local
 *   (`pnpm dev`/`pnpm build` fuera de Vercel), estas variables no existen
 *   y `commit`/`deploymentId` se devuelven como `null` en vez de fallar.
 */
export interface VersionCommitInfo {
  sha: string;
  shortSha: string;
  ref: string | null;
  message: string | null;
}

export interface VersionInfo {
  appVersion: string;
  environment: string;
  region: string | null;
  deploymentId: string | null;
  commit: VersionCommitInfo | null;
}

export function getVersionInfo(): VersionInfo {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? null;

  return {
    appVersion: packageJson.version,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    region: process.env.VERCEL_REGION ?? null,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    commit: sha
      ? {
          sha,
          shortSha: sha.slice(0, 7),
          ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
          message: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
        }
      : null,
  };
}
