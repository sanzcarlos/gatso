import { count, eq } from "drizzle-orm";
import { db, currencies } from "@/db";
import { AppError } from "@/lib/errors";
import { isUniqueViolation } from "@/lib/db/errors";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { recordAuditLog } from "@/lib/audit/service";
import type { CreateCurrencyInput } from "@/lib/validation/currencies";

/** Limite de monedas activas simultaneamente (Fase 6, decision de diseno original). */
export const MAX_ACTIVE_CURRENCIES = 16;

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

/** Catalogo completo (activas e inactivas), solo para administracion. */
export async function listAllCurrencies(actingUserId: string) {
  await requirePlatformAdmin(actingUserId);
  return db.select().from(currencies).orderBy(currencies.code);
}

async function countActiveCurrencies(): Promise<number> {
  const [row] = await db.select({ value: count() }).from(currencies).where(eq(currencies.isActive, true));
  return row?.value ?? 0;
}

/**
 * Crea una moneda nueva en el catalogo (Fase 6). Se crea activa por
 * defecto, respetando el limite maximo de {@link MAX_ACTIVE_CURRENCIES}
 * monedas activas simultaneas (decision de diseno original, Fase 0).
 */
export async function createCurrency(actingUserId: string, input: CreateCurrencyInput) {
  await requirePlatformAdmin(actingUserId);

  const activeCount = await countActiveCurrencies();
  if (activeCount >= MAX_ACTIVE_CURRENCIES) {
    throw new AppError(
      409,
      `Se ha alcanzado el limite de ${MAX_ACTIVE_CURRENCIES} monedas activas; desactiva otra antes de anadir una nueva`,
      "active_currency_limit_reached",
    );
  }

  try {
    const [currency] = await db
      .insert(currencies)
      .values({
        code: input.code,
        name: input.name,
        symbol: input.symbol,
        decimalDigits: input.decimalDigits,
        isActive: true,
      })
      .returning();
    if (!currency) throw new AppError(500, "No se pudo crear la moneda");

    await recordAuditLog(db, {
      actorUserId: actingUserId,
      action: "create",
      entityType: "currency",
      entityId: currency.code,
      afterData: currency,
    });

    return currency;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, `La moneda "${input.code}" ya existe`, "currency_already_exists");
    }
    throw error;
  }
}

/**
 * Activa o desactiva una moneda existente. Al activar, se respeta el
 * mismo limite de {@link MAX_ACTIVE_CURRENCIES} monedas activas. Desactivar
 * nunca falla por limite (solo reduce el conteo) y no borra la moneda ni
 * los gastos historicos que ya la usan (`currencies` es referenciada por
 * `expenses.currency_code`; los gastos existentes siguen mostrandose con
 * normalidad, simplemente la moneda deja de ofrecerse para gastos nuevos).
 */
export async function setCurrencyActive(actingUserId: string, code: string, isActive: boolean) {
  await requirePlatformAdmin(actingUserId);

  const [currentCurrency] = await db.select().from(currencies).where(eq(currencies.code, code)).limit(1);
  if (!currentCurrency) throw new AppError(404, "Moneda no encontrada", "currency_not_found");

  if (isActive && !currentCurrency.isActive) {
    const activeCount = await countActiveCurrencies();
    if (activeCount >= MAX_ACTIVE_CURRENCIES) {
      throw new AppError(
        409,
        `Se ha alcanzado el limite de ${MAX_ACTIVE_CURRENCIES} monedas activas; desactiva otra antes de activar esta`,
        "active_currency_limit_reached",
      );
    }
  }

  const [updated] = await db.update(currencies).set({ isActive }).where(eq(currencies.code, code)).returning();
  if (!updated) throw new AppError(404, "Moneda no encontrada", "currency_not_found");

  await recordAuditLog(db, {
    actorUserId: actingUserId,
    action: "update",
    entityType: "currency",
    entityId: updated.code,
    beforeData: currentCurrency,
    afterData: updated,
  });

  return updated;
}
