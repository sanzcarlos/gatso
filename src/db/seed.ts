import { eq } from "drizzle-orm";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

// Import dinamico tras cargar .env* para que `src/lib/env.ts` (leido por
// `src/db/index.ts`) encuentre DATABASE_URL ya en `process.env`.
async function main() {
  const { db, currencies } = await import("./index");

  const seedCurrencies = [
    { code: "EUR", name: "Euro", symbol: "€", decimalDigits: 2 },
    { code: "USD", name: "Dolar estadounidense", symbol: "$", decimalDigits: 2 },
  ] as const;

  for (const currency of seedCurrencies) {
    const [existing] = await db.select().from(currencies).where(eq(currencies.code, currency.code)).limit(1);
    if (existing) {
      console.log(`Moneda ${currency.code} ya existe, se omite.`);
      continue;
    }
    await db.insert(currencies).values(currency);
    console.log(`Moneda ${currency.code} insertada.`);
  }

  console.log("Seed completado.");
  process.exit(0);
}

main().catch((error) => {
  console.error("Error al ejecutar el seed:", error);
  process.exit(1);
});
