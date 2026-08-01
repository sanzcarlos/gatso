import type { NextConfig } from "next";
import { createRequire } from "node:module";
import { dirname } from "node:path";

const require = createRequire(import.meta.url);

/**
 * Resuelve la ruta REAL (no simlinkada) del paquete de argon2 en disco.
 * pnpm coloca los paquetes en `.pnpm/<pkg>@<version>/node_modules/<pkg>`
 * y `node_modules/<pkg>` es solo un symlink relativo hacia ahi. Si
 * `outputFileTracingIncludes` usa un glob que atraviesa ese symlink
 * (`./node_modules/argon2/...`), Vercel rechaza el paquete de la funcion
 * serverless con "invalid deployment package ... files in symlinked
 * directories" (el empaquetador de Vercel descarta cualquier archivo cuyo
 * directorio padre sea un symlink interno). `require.resolve` sigue el
 * symlink y devuelve la ruta real dentro de `.pnpm/`, evitando el
 * problema sin dejar de incluir el binario nativo en el bundle.
 */
const argon2PackageDir = dirname(require.resolve("argon2/package.json"));

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  experimental: {
    // TypeScript 7 (compilador nativo) no expone la Compiler API que
    // Next.js usa por defecto; esto le indica que invoque el CLI de tsc
    // en su lugar. Ver aviso al arrancar `next dev` con TS 7 instalado.
    useTypeScriptCli: true,
  },
  // `argon2` (hash de contrasenas, Fase 1) es un modulo nativo (.node
  // binario). Next.js ya lo excluye del bundle de servidor por defecto,
  // pero lo declaramos explicitamente por claridad y para cubrir
  // versiones/entornos donde ese default pueda no aplicarse.
  serverExternalPackages: ["argon2"],
  // Red de seguridad para el despliegue en Vercel: el tracer de archivos
  // de salida (@vercel/nft) puede no detectar el binario nativo de argon2
  // al empaquetar cada funcion serverless si se carga de forma dinamica;
  // esto fuerza su inclusion explicita en las rutas que lo usan
  // (autenticacion: login/registro/recuperacion/aceptar invitacion). Se
  // usa la ruta real resuelta arriba (no "./node_modules/argon2/...") para
  // no atravesar el symlink de pnpm.
  outputFileTracingIncludes: {
    "/api/auth/**": [`${argon2PackageDir}/prebuilds/**/*`],
    "/api/invitations/**": [`${argon2PackageDir}/prebuilds/**/*`],
  },
  async headers() {
    // Cabeceras de seguridad HTTP basicas (Fase 4), aplicadas a toda la
    // app: mitigan clickjacking (X-Frame-Options), sniffing de MIME
    // type, fuga de referrer entre origenes y acceso innecesario a APIs
    // sensibles del navegador. HSTS no se fija aqui porque Vercel ya la
    // anade automaticamente en produccion sobre HTTPS.
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
