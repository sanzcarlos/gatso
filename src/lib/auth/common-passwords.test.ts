import { describe, it, expect } from "vitest";
import { isCommonPassword } from "./common-passwords";

describe("isCommonPassword", () => {
  it("rechaza contrasenas presentes en la lista, sin importar mayusculas/espacios", () => {
    expect(isCommonPassword("password123")).toBe(true);
    expect(isCommonPassword("Password123")).toBe(true);
    expect(isCommonPassword("  qwerty123  ")).toBe(true);
    expect(isCommonPassword("123456789")).toBe(true);
  });

  it("rechaza el mismo caracter repetido", () => {
    expect(isCommonPassword("aaaaaaaaaa")).toBe(true);
    expect(isCommonPassword("zzzzzzzzzzzz")).toBe(true);
  });

  it("rechaza secuencias consecutivas ascendentes o descendentes de al menos 6 caracteres", () => {
    expect(isCommonPassword("ab23456789cd")).toBe(true);
    expect(isCommonPassword("xy987654zt")).toBe(true);
    expect(isCommonPassword("prefixabcdefghsuffix")).toBe(true);
  });

  it("no marca secuencias cortas (menos de 6) como triviales", () => {
    expect(isCommonPassword("correctHorse12345")).toBe(false);
    expect(isCommonPassword("a1b2c3d4e5f6g7h8")).toBe(false);
  });

  it("acepta contrasenas robustas no presentes en la lista", () => {
    expect(isCommonPassword("Tr0ub4dor&3XyZ!")).toBe(false);
    expect(isCommonPassword("correct-horse-battery-staple-42")).toBe(false);
  });
});
