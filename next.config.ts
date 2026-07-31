import type { NextConfig } from "next";

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
  // (autenticacion: login/registro/recuperacion/aceptar invitacion).
  outputFileTracingIncludes: {
    "/api/auth/**": ["./node_modules/argon2/prebuilds/**/*"],
    "/api/invitations/**": ["./node_modules/argon2/prebuilds/**/*"],
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
