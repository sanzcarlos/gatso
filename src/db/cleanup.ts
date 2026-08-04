import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

// Import dinamico tras cargar .env* (mismo patron que src/db/seed.ts) para
// que src/lib/env.ts encuentre DATABASE_URL ya en process.env.
async function main() {
  const { runRetentionCleanup } = await import("@/lib/retention/service");
  const report = await runRetentionCleanup();

  console.log("Limpieza de retencion completada:");
  console.log(`  - Intentos de login/recuperacion borrados: ${report.authAttemptsDeleted}`);
  console.log(`  - Notificaciones leidas borradas: ${report.readNotificationsDeleted}`);
  console.log(`  - Tipos de cambio historicos superados borrados: ${report.exchangeRatesDeleted}`);
  console.log(`  - Intentos de rate limiting (registro/invitaciones/union) borrados: ${report.rateLimitAttemptsDeleted}`);

  process.exit(0);
}

main().catch((error) => {
  console.error("Error al ejecutar la limpieza de retencion:", error);
  process.exit(1);
});
