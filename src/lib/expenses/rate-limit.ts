import { desc, eq } from "drizzle-orm";
import { db, expenses, appConfig, type Tx } from "@/db";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

export const EXPENSE_RATE_LIMIT_CONFIG_KEY = "expense_creation_rate_limit_seconds";

/**
 * Lee el limite de rate limiting desde `app_config` (ajustable en runtime
 * sin redeploy) con fallback a la variable de entorno
 * `RATE_LIMIT_EXPENSE_CREATION_SECONDS` si no hay fila configurada o su
 * valor no es un numero positivo valido.
 */
export async function getExpenseCreationRateLimitSeconds(client: Tx | typeof db = db): Promise<number> {
  const [row] = await client
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, EXPENSE_RATE_LIMIT_CONFIG_KEY))
    .limit(1);

  if (!row) return env.RATE_LIMIT_EXPENSE_CREATION_SECONDS;

  const parsed = Number(row.value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : env.RATE_LIMIT_EXPENSE_CREATION_SECONDS;
}

/**
 * Un usuario no puede crear mas de una entrada de gasto cada N segundos
 * (limite global, no por grupo). Se comprueba dentro de la misma
 * transaccion de creacion para minimizar la ventana de doble envio.
 */
export async function enforceExpenseCreationRateLimit(client: Tx, userId: string): Promise<void> {
  const limitSeconds = await getExpenseCreationRateLimitSeconds(client);

  const [lastExpense] = await client
    .select({ createdAt: expenses.createdAt })
    .from(expenses)
    .where(eq(expenses.createdBy, userId))
    .orderBy(desc(expenses.createdAt))
    .limit(1);

  if (!lastExpense) return;

  const elapsedMs = Date.now() - lastExpense.createdAt.getTime();
  const remainingMs = limitSeconds * 1000 - elapsedMs;
  if (remainingMs > 0) {
    throw new AppError(
      429,
      `Debes esperar ${Math.ceil(remainingMs / 1000)}s antes de crear otro gasto`,
      "rate_limited",
    );
  }
}
