import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  experimental: {
    // TypeScript 7 (compilador nativo) no expone la Compiler API que
    // Next.js usa por defecto; esto le indica que invoque el CLI de tsc
    // en su lugar. Ver aviso al arrancar `next dev` con TS 7 instalado.
    useTypeScriptCli: true,
  },
};

export default nextConfig;
