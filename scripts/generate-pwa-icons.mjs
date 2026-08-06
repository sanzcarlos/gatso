// Genera los iconos PNG del manifiesto PWA (Fase 7) a partir de
// `public/icons/icon.svg` (mismo SVG fuente que `src/app/icon.svg`, usado
// por Next.js para el favicon). Usa `@resvg/resvg-js` (binarios prebuilt,
// sin compilacion nativa) solo como devDependency de build-time; el
// resultado son ficheros PNG estaticos en `public/icons/`, no una
// dependencia en runtime.
//
// Uso: node scripts/generate-pwa-icons.mjs
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const svgPath = join(root, "public", "icons", "icon.svg");
const svg = readFileSync(svgPath, "utf8");

// Iconos "any": el SVG fuente ya cubre el lienzo completo (rect de fondo
// sin margen), asi que sirven directamente tambien como iconos
// "maskable" (Android puede recortarlos a circulo/squircle sin perder el
// logo, ya que no hay contenido pegado al borde salvo el propio fondo).
const targets = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "icon-maskable-192.png", size: 192 },
  { file: "icon-maskable-512.png", size: 512 },
];

for (const { file, size } of targets) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    background: "#c9c2f0",
  });
  const png = resvg.render().asPng();
  writeFileSync(join(root, "public", "icons", file), png);
  console.log(`generado public/icons/${file} (${size}x${size})`);
}

// apple-touch-icon: convencion de fichero de Next.js App Router
// (`src/app/apple-icon.png`), anade automaticamente
// <link rel="apple-touch-icon"> sin tocar layout.tsx.
const appleIcon = new Resvg(svg, {
  fitTo: { mode: "width", value: 180 },
  background: "#c9c2f0",
}).render().asPng();
writeFileSync(join(root, "src", "app", "apple-icon.png"), appleIcon);
console.log("generado src/app/apple-icon.png (180x180)");
