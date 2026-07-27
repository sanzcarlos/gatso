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
  ["background / foreground", "#ffffff", "#0f172a", false, "claro"],
  ["card / card-foreground", "#ffffff", "#0f172a", false, "claro"],
  ["muted / muted-foreground", "#f1f5f9", "#475569", false, "claro"],
  ["primary / primary-foreground", "#4338ca", "#ffffff", false, "claro"],
  ["secondary / secondary-foreground", "#f1f5f9", "#0f172a", false, "claro"],
  ["destructive / destructive-foreground", "#b91c1c", "#ffffff", false, "claro"],
  ["success / success-foreground", "#15803d", "#ffffff", false, "claro"],
  ["warning / warning-foreground", "#a16207", "#ffffff", false, "claro"],
  ["info / info-foreground", "#0369a1", "#ffffff", false, "claro"],
  ["border (UI) / background", "#64748b", "#ffffff", true, "claro"],
  ["accent / accent-foreground", "#e0e7ff", "#3730a3", false, "claro"],
  ["background / foreground", "#0b0f14", "#f1f5f9", false, "oscuro"],
  ["card / card-foreground", "#111827", "#f1f5f9", false, "oscuro"],
  ["muted / muted-foreground", "#1e293b", "#94a3b8", false, "oscuro"],
  ["primary / primary-foreground", "#818cf8", "#0b0f14", false, "oscuro"],
  ["secondary / secondary-foreground", "#1e293b", "#f1f5f9", false, "oscuro"],
  ["destructive / destructive-foreground", "#f87171", "#0b0f14", false, "oscuro"],
  ["success / success-foreground", "#4ade80", "#0b0f14", false, "oscuro"],
  ["warning / warning-foreground", "#fbbf24", "#0b0f14", false, "oscuro"],
  ["info / info-foreground", "#38bdf8", "#0b0f14", false, "oscuro"],
  ["border (UI) / background", "#64748b", "#0b0f14", true, "oscuro"],
  ["accent / accent-foreground", "#312e81", "#c7d2fe", false, "oscuro"],
];

console.log("| Modo | Combinacion | Fondo | Texto | Ratio | Minimo requerido | Resultado |");
console.log("|---|---|---|---|---|---|---|");
let anyFail = false;
for (const [name, bg, fg, isLargeOrUi, mode] of pairs) {
  const ratio = contrastRatio(bg, fg);
  const result = verdict(ratio, isLargeOrUi);
  if (result === "FAIL") anyFail = true;
  const minLabel = isLargeOrUi ? "3:1 (AA UI/grande)" : "4.5:1 (AA texto)";
  console.log(
    `| ${mode} | ${name} | ${bg} | ${fg} | ${ratio.toFixed(2)}:1 | ${minLabel} | ${result} |`,
  );
}
console.log("");
console.log(anyFail ? "RESULTADO: hay combinaciones que fallan AA." : "RESULTADO: todas las combinaciones cumplen AA (o mejor).");
