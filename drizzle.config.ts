import { defineConfig } from "drizzle-kit";
import { config as loadEnv } from "dotenv";

// drizzle-kit (CLI independiente de Next.js) solo carga ".env" de forma
// automatica, no ".env.local" (esa es una convencion propia de Next.js).
// Cargamos explicitamente ambos aqui para que `pnpm db:*` funcione igual
// que `pnpm dev` sin duplicar variables en dos ficheros.
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

export default defineConfig({
  schema: "./src/db/schema",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL as string,
  },
  strict: true,
  verbose: true,
});
