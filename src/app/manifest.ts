import type { MetadataRoute } from "next";

/**
 * Manifiesto de la PWA (Fase 7). Convencion de fichero de Next.js App
 * Router: al existir `src/app/manifest.ts`, Next.js lo sirve en
 * `/manifest.webmanifest` y anade automaticamente
 * `<link rel="manifest">` en el `<head>`, sin tocar `layout.tsx`.
 *
 * Los iconos "any" y "maskable" apuntan a los mismos PNG (ver
 * `scripts/generate-pwa-icons.mjs`): el SVG fuente ya tiene el fondo a
 * sangre completa (sin margen transparente), por lo que sirve igual de
 * bien recortado a circulo/squircle en Android.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gatso — Control de gastos compartidos",
    short_name: "Gatso",
    description: "Control de gastos compartidos entre amigos, con privacidad por diseno.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#4338ca",
    lang: "es",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
