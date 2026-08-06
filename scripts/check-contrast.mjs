// Script de verificacion de contraste WCAG 2.1 (formula oficial de
// luminancia relativa). Uso: node scripts/check-contrast.mjs
// No requiere dependencias externas.

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const bigint = parseInt(h, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

function channelLuminance(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function relativeLuminance({ r, g, b }) {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

function contrastRatio(hexA, hexB) {
  const lA = relativeLuminance(hexToRgb(hexA));
  const lB = relativeLuminance(hexToRgb(hexB));
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

function verdict(ratio, isLargeOrUi) {
  const aaThreshold = isLargeOrUi ? 3 : 4.5;
  const aaaThreshold = isLargeOrUi ? 4.5 : 7;
  if (ratio >= aaaThreshold) return "AAA";
  if (ratio >= aaThreshold) return "AA";
  return "FAIL";
}

const pairs = [
  // [nombre, fondo, texto, esGrandeOUi, modo]
  ["background / foreground", "#fbfaf4", "#25223a", false, "claro"],
  ["card / card-foreground", "#fffdf8", "#25223a", false, "claro"],
  ["muted / muted-foreground", "#f1e9e2", "#453d52", false, "claro"],
  ["primary / primary-foreground", "#c9c2f0", "#211a44", false, "claro"],
  ["primary-hover / primary-foreground", "#b8afe8", "#211a44", false, "claro"],
  ["background / primary-ink", "#fbfaf4", "#514585", false, "claro"],
  ["secondary / secondary-foreground", "#e8def8", "#2f2147", false, "claro"],
  ["accent / accent-foreground", "#d9edf0", "#173f46", false, "claro"],
  ["destructive / destructive-foreground", "#f4c7c3", "#571414", false, "claro"],
  ["destructive-hover / destructive-foreground", "#eab0ad", "#571414", false, "claro"],
  ["background / destructive-ink", "#fbfaf4", "#571414", false, "claro"],
  ["success / success-foreground", "#c9e8d1", "#153b21", false, "claro"],
  ["background / success-ink", "#fbfaf4", "#153b21", false, "claro"],
  ["warning / warning-foreground", "#f3dfad", "#513800", false, "claro"],
  ["background / warning-ink", "#fbfaf4", "#513800", false, "claro"],
  ["info / info-foreground", "#cbe4f4", "#153c57", false, "claro"],
  ["background / info-ink", "#fbfaf4", "#153c57", false, "claro"],
  ["input (UI) / background", "#665a8f", "#fbfaf4", true, "claro"],
  ["ring (UI) / background", "#5b4b8a", "#fbfaf4", true, "claro"],
  ["background / foreground", "#171521", "#f7f1f5", false, "oscuro"],
  ["card / card-foreground", "#211e2d", "#f7f1f5", false, "oscuro"],
  ["muted / muted-foreground", "#2a2734", "#d7cedd", false, "oscuro"],
  ["primary / primary-foreground", "#c9c2f0", "#211a44", false, "oscuro"],
  ["primary-hover / primary-foreground", "#ddd8f7", "#211a44", false, "oscuro"],
  ["background / primary-ink", "#171521", "#c9c2f0", false, "oscuro"],
  ["secondary / secondary-foreground", "#302b3d", "#f7f1f5", false, "oscuro"],
  ["accent / accent-foreground", "#d9edf0", "#173f46", false, "oscuro"],
  ["destructive / destructive-foreground", "#f4c7c3", "#571414", false, "oscuro"],
  ["destructive-hover / destructive-foreground", "#eab0ad", "#571414", false, "oscuro"],
  ["background / destructive-ink", "#171521", "#f4c7c3", false, "oscuro"],
  ["success / success-foreground", "#c9e8d1", "#153b21", false, "oscuro"],
  ["background / success-ink", "#171521", "#c9e8d1", false, "oscuro"],
  ["warning / warning-foreground", "#f3dfad", "#513800", false, "oscuro"],
  ["background / warning-ink", "#171521", "#f3dfad", false, "oscuro"],
  ["info / info-foreground", "#cbe4f4", "#153c57", false, "oscuro"],
  ["background / info-ink", "#171521", "#cbe4f4", false, "oscuro"],
  ["input (UI) / background", "#a99cbd", "#171521", true, "oscuro"],
  ["ring (UI) / background", "#c9c2f0", "#171521", true, "oscuro"],
];

console.log("| Modo | Combinacion | Fondo | Texto | Ratio | Minimo requerido | Resultado |");
console.log("|---|---|---|---|---|---|---|");
let anyBelowAaa = false;
for (const [name, bg, fg, isLargeOrUi, mode] of pairs) {
  const ratio = contrastRatio(bg, fg);
  const result = verdict(ratio, isLargeOrUi);
  if (result !== "AAA") anyBelowAaa = true;
  const minLabel = isLargeOrUi ? "4.5:1 (AAA UI/grande)" : "7:1 (AAA texto)";
  console.log(
    `| ${mode} | ${name} | ${bg} | ${fg} | ${ratio.toFixed(2)}:1 | ${minLabel} | ${result} |`,
  );
}
console.log("");
console.log(anyBelowAaa ? "RESULTADO: hay combinaciones por debajo de AAA." : "RESULTADO: todas las combinaciones verificadas cumplen AAA.");
if (anyBelowAaa) process.exitCode = 1;
