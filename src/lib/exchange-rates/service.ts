import { desc, eq, sql } from "drizzle-orm";
import { db, exchangeRates, currencies, appConfig } from "@/db";
import { AppError } from "@/lib/errors";
import { createSingleFlight } from "@/lib/concurrency/dedupe";
import { parseEcbEnvelope } from "./ecb-xml";
import { shouldAttemptEcbRefresh, type EcbFetchAttempt } from "./freshness";

export const ECB_DAILY_RATES_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

/** Observabilidad (Fase 10, backlog): guarda cuando fue el ultimo intento de refresco del BCE y si tuvo exito. */
const ECB_FETCH_STATUS_CONFIG_KEY = "ecb_last_fetch_status";

/**
 * Descarga el XML de referencia diaria del BCE y lo parsea
 * (`parseEcbEnvelope`, separado a `./ecb-xml.ts` para poder testear el
 * formato sin red ni base de datos).
 */
export async function fetchEcbDailyRates() {
  const response = await fetch(ECB_DAILY_RATES_URL);
  if (!response.ok) {
    throw new AppError(502, "No se pudo consultar el tipo de cambio del BCE", "ecb_fetch_failed");
  }
  const xml = await response.text();
  return parseEcbEnvelope(xml);
}

/** Guarda (o actualiza) las tasas del dia indicado, ignorando monedas que no existan en el catalogo. */
export async function storeEcbRates(asOfDate: string, rates: Map<string, number>): Promise<void> {
  const knownCodes = new Set((await db.select({ code: currencies.code }).from(currencies)).map((c) => c.code));

  const rows = [...rates.entries()]
    .filter(([code]) => knownCodes.has(code))
    .map(([currencyCode, rate]) => ({
      currencyCode,
      rateToEur: rate.toFixed(6),
      asOfDate,
    }));
  if (rows.length === 0) return;

  await db
    .insert(exchangeRates)
    .values(rows)
    .onConflictDoUpdate({
      target: [exchangeRates.currencyCode, exchangeRates.asOfDate],
      set: { rateToEur: sql`excluded.rate_to_eur` },
    });
}

async function getLatestStoredDate(): Promise<string | null> {
  const [row] = await db
    .select({ asOfDate: exchangeRates.asOfDate })
    .from(exchangeRates)
    .orderBy(desc(exchangeRates.asOfDate))
    .limit(1);
  return row?.asOfDate ?? null;
}

async function getLastEcbFetchAttempt(): Promise<EcbFetchAttempt | null> {
  const [row] = await db
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, ECB_FETCH_STATUS_CONFIG_KEY))
    .limit(1);
  if (!row) return null;
  try {
    return JSON.parse(row.value) as EcbFetchAttempt;
  } catch {
    return null;
  }
}

async function recordEcbFetchAttempt(attempt: EcbFetchAttempt): Promise<void> {
  const value = JSON.stringify(attempt).slice(0, 256);
  await db
    .insert(appConfig)
    .values({
      key: ECB_FETCH_STATUS_CONFIG_KEY,
      value,
      description: "Ultimo intento de refresco de tipos de cambio del BCE (observabilidad, Fase 10)",
    })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value, updatedAt: new Date() },
    });
}

async function refreshEcbRatesNow(): Promise<void> {
  try {
    const { asOfDate, rates } = await fetchEcbDailyRates();
    await storeEcbRates(asOfDate, rates);
    await recordEcbFetchAttempt({ attemptedAt: new Date().toISOString(), status: "success" });
  } catch (error) {
    await recordEcbFetchAttempt({
      attemptedAt: new Date().toISOString(),
      status: "error",
      error: error instanceof Error ? error.message.slice(0, 180) : "Error desconocido",
    }).catch(() => {
      // Si ni siquiera se puede registrar el intento fallido, se ignora:
      // `getRateToEur` seguira funcionando con la ultima tasa guardada.
    });
  }
}

/** Un solo refresco en curso por instancia de proceso (evita rafagas de peticiones concurrentes al BCE, ver `createSingleFlight`). */
const runSingleFlightRefresh = createSingleFlight(refreshEcbRatesNow);

/**
 * Refresca las tasas del BCE como maximo una vez por dia habil publicado
 * y, si el ultimo intento fallo, no antes de `ECB_RETRY_INTERVAL_MS` (ver
 * `shouldAttemptEcbRefresh`, `src/lib/exchange-rates/freshness.ts`):
 * evita golpear al BCE en cada peticion durante fines de
 * semana/festivos, cuando `latestStoredDate` nunca llega a igualar "hoy"
 * porque no se ha publicado nada nuevo. Si el BCE no esta disponible, no
 * lanza error aqui: se sigue usando la ultima tasa guardada (mejor una
 * conversion con una tasa de ayer que ninguna conversion); `getRateToEur`
 * distingue el motivo si finalmente no hay ninguna tasa utilizable.
 */
export async function ensureFreshEcbRates(): Promise<void> {
  const [latestStoredDate, lastAttempt] = await Promise.all([getLatestStoredDate(), getLastEcbFetchAttempt()]);

  if (!shouldAttemptEcbRefresh({ latestStoredDate, lastAttempt, now: new Date() })) return;

  await runSingleFlightRefresh();
}

/** Tasa "unidades de `currencyCode` por 1 EUR" mas reciente disponible (EUR siempre vale 1). */
export async function getRateToEur(currencyCode: string): Promise<number> {
  if (currencyCode === "EUR") return 1;

  await ensureFreshEcbRates();

  const [row] = await db
    .select({ rateToEur: exchangeRates.rateToEur })
    .from(exchangeRates)
    .where(eq(exchangeRates.currencyCode, currencyCode))
    .orderBy(desc(exchangeRates.asOfDate))
    .limit(1);

  if (!row) {
    // Observabilidad (Fase 10, backlog): distingue si no hay tasa porque
    // el BCE esta caido (el ultimo intento fallo) de si simplemente esa
    // moneda nunca ha tenido tasa publicada por el BCE.
    const lastAttempt = await getLastEcbFetchAttempt();
    if (lastAttempt?.status === "error") {
      throw new AppError(
        502,
        `El Banco Central Europeo no esta disponible y no hay ningun tipo de cambio guardado para "${currencyCode}"`,
        "ecb_unavailable",
      );
    }
    throw new AppError(
      502,
      `No hay tipo de cambio disponible para "${currencyCode}"`,
      "exchange_rate_unavailable",
    );
  }
  return Number(row.rateToEur);
}

/** Convierte un importe en centimos de `fromCurrency` a `toCurrency` usando el cambio de referencia del BCE (via EUR). */
export async function convertCents(amountCents: number, fromCurrency: string, toCurrency: string): Promise<number> {
  if (fromCurrency === toCurrency) return amountCents;

  const [rateFrom, rateTo] = await Promise.all([getRateToEur(fromCurrency), getRateToEur(toCurrency)]);
  const amountEurCents = (amountCents / rateFrom) * rateTo;
  return Math.round(amountEurCents);
}
