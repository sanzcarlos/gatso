import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Usamos el driver WebSocket (neon-serverless / Pool) en lugar de neon-http
 * porque necesitamos transacciones interactivas reales (db.transaction) para
 * operaciones atomicas: crear grupo+membresia, crear gasto+repartos, rotar
 * codigo de recuperacion junto con el registro de auditoria, etc. El driver
 * HTTP (neon-http) solo soporta consultas individuales no interactivas
 * (ver PROGRESS.md, decision revisada en Fase 2).
 */
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: env.DATABASE_URL });

export const db = drizzle({ client: pool, schema });

/** Tipo del cliente de transaccion interactiva (`db.transaction(async (tx) => ...)`). */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export * from "./schema";
