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
