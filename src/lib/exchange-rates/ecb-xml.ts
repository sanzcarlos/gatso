import { XMLParser } from "fast-xml-parser";
import { AppError } from "@/lib/errors";

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
    Cube: { Cube: EcbCubeDate | EcbCubeDate[] };
  };
}

export interface ParsedEcbRates {
  asOfDate: string;
  rates: Map<string, number>;
}

/**
 * Parsea el XML diario de referencia del BCE
 * (`eurofxref-daily.xml`, formato estable documentado publicamente).
 * Separado de `fetchEcbDailyRates` (que hace la peticion de red) para
 * poder testear el parseo con fixtures XML reales sin red ni base de
 * datos (Fase 10, backlog "Pruebas de la Fase 10").
 */
export function parseEcbEnvelope(xml: string): ParsedEcbRates {
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
    const code = entry?.["@_currency"];
    const rate = Number(entry?.["@_rate"]);
    if (code && Number.isFinite(rate) && rate > 0) {
      rates.set(code, rate);
    }
  }

  if (rates.size === 0) {
    throw new AppError(502, "Respuesta del BCE sin ninguna tasa de cambio valida", "ecb_parse_failed");
  }

  return { asOfDate: dateEntry["@_time"], rates };
}
