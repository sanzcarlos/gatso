import { describe, it, expect } from "vitest";
import { parseEcbEnvelope } from "./ecb-xml";
import { AppError } from "@/lib/errors";

const MULTI_CURRENCY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <gesmes:subject>Reference rates</gesmes:subject>
  <Cube>
    <Cube time="2026-08-03">
      <Cube currency="USD" rate="1.0854"/>
      <Cube currency="JPY" rate="163.42"/>
      <Cube currency="GBP" rate="0.8321"/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

const SINGLE_CURRENCY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <gesmes:subject>Reference rates</gesmes:subject>
  <Cube>
    <Cube time="2026-08-03">
      <Cube currency="USD" rate="1.0854"/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

describe("parseEcbEnvelope", () => {
  it("parsea varias monedas del XML del BCE", () => {
    const { asOfDate, rates } = parseEcbEnvelope(MULTI_CURRENCY_XML);
    expect(asOfDate).toBe("2026-08-03");
    expect(rates.get("USD")).toBe(1.0854);
    expect(rates.get("JPY")).toBe(163.42);
    expect(rates.get("GBP")).toBe(0.8321);
    expect(rates.size).toBe(3);
  });

  it("parsea correctamente cuando solo hay una moneda (fast-xml-parser no devuelve array)", () => {
    const { asOfDate, rates } = parseEcbEnvelope(SINGLE_CURRENCY_XML);
    expect(asOfDate).toBe("2026-08-03");
    expect(rates.get("USD")).toBe(1.0854);
    expect(rates.size).toBe(1);
  });

  it("ignora entradas con tasa no numerica o no positiva", () => {
    const xml = `<?xml version="1.0"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01">
  <Cube>
    <Cube time="2026-08-03">
      <Cube currency="USD" rate="1.0854"/>
      <Cube currency="XXX" rate="abc"/>
      <Cube currency="YYY" rate="-1"/>
      <Cube currency="ZZZ" rate="0"/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;
    const { rates } = parseEcbEnvelope(xml);
    expect(rates.size).toBe(1);
    expect(rates.get("USD")).toBe(1.0854);
  });

  it("lanza AppError si falta el envelope esperado", () => {
    expect(() => parseEcbEnvelope("<not-ecb-format/>")).toThrow(AppError);
  });

  it("lanza AppError si no hay ninguna tasa valida", () => {
    const xml = `<?xml version="1.0"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01">
  <Cube>
    <Cube time="2026-08-03">
      <Cube currency="XXX" rate="abc"/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;
    expect(() => parseEcbEnvelope(xml)).toThrow(AppError);
  });

  it("lanza AppError con XML vacio/invalido", () => {
    expect(() => parseEcbEnvelope("")).toThrow(AppError);
  });
});
