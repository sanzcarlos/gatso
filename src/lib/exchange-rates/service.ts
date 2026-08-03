import { XMLParser } from "fast-xml-parser";
import { desc, eq, sql } from "drizzle-orm";
import { db, exchangeRates, currencies } from "@/db";
import { AppError } from "@/lib/errors";

export const ECB_DAILY_RATES_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

interface EcbCubeRate {
  "@_currency": string;
  "@_rate": string;
}

interface EcbCubeDate {
  "@_time": string;
  Cube: EcbCubeRate | EcbCubeRate[];
}

interface EcbEnvelope {
  "gesmes:Envelope": {
    Cube: {
      Cube: EcbCubeDate | EcbCubeDate[];
    };
  };
}

/**
 * Descarga y parsea el XML de referencia diaria del BCE (formato
 * "gesmes:Envelope" con un unico bloque `Cube[@time]` que contiene, a su
 * vez, un `Cube[@currency][@rate]` por cada moneda: "unidades de esa
 * moneda por 1 EUR"). El BCE no publica el EUR como fila (su tasa es
 * siempre 1 por definicion).
 */
export async function fetchEcbDailyRates(): Promise<{ asOfDate: string; rates: Map<string, number> }> {
  const response = await fetch(ECB_DAILY_RATES_URL);
  if (!response.ok) {
    throw new AppError(502, "No se pudo consultar el tipo de cambio del BCE", "ecb_fetch_failed");
  }
  const xml = await response.text();

  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(xml) as EcbEnvelope;

  const dateCube = parsed["gesmes:Envelope"]?.Cube?.Cube;
  const dateEntry = Array.isArray(dateCube) ? dateCube[0] : dateCube;
  if (!dateEntry) {
    throw new AppError(502, "Respuesta del BCE con formato inesperado", "ecb_parse_failed");
  }

  const rateEntries = Array.isArray(dateEntry.Cube) ? dateEntry.Cube : [dateEntry.Cube];
  const rates = new Map<string, number>();
  for (const entry of rateEntries) {
    const code = entry["@_currency"];
    const rate = Number(entry["@_rate"]);
    if (code && Number.isFinite(rate) && rate > 0) rates.set(code, rate);
  }

  return { asOfDate: dateEntry["@_time"], rates };
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

/**
 * Refresca la cache local si no se ha consultado el BCE hoy todavia
 * (comparando la fecha de la ultima fila guardada con la fecha actual en
 * UTC). Si el BCE no esta disponible, no lanza error: se sigue usando la
 * ultima tasa guardada (mejor una conversion con una tasa de ayer que
 * ninguna conversion).
 */
export async function ensureFreshEcbRates(): Promise<void> {
  const latestStoredDate = await getLatestStoredDate();
  const today = new Date().toISOString().slice(0, 10);
  if (latestStoredDate === today) return;

  try {
    const { asOfDate, rates } = await fetchEcbDailyRates();
    await storeEcbRates(asOfDate, rates);
  } catch {
    // Se ignora: si no hay ninguna tasa guardada nunca, `getRateToEur` lanzara su propio error.
  }
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
