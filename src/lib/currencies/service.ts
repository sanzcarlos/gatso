import { eq } from "drizzle-orm";
import { db, currencies } from "@/db";
import { AppError } from "@/lib/errors";

/**
 * Servicio minimo de monedas. La gestion completa del catalogo (alta de
 * monedas nuevas, limite de 16 activas, etc.) llega en Fase 6; aqui solo
 * se expone lo necesario para que Fase 3 (gastos) pueda validar y listar
 * monedas activas.
 */
export async function listActiveCurrencies() {
  return db.select().from(currencies).where(eq(currencies.isActive, true));
}

export async function requireActiveCurrency(code: string) {
  const [currency] = await db.select().from(currencies).where(eq(currencies.code, code)).limit(1);
  if (!currency || !currency.isActive) {
    throw new AppError(400, `Moneda no soportada: "${code}"`, "unsupported_currency");
  }
  return currency;
}
