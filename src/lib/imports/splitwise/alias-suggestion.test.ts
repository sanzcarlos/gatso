import { describe, expect, it } from "vitest";
import { suggestAliasFromDisplayName } from "./alias-suggestion";

const ALIAS_PATTERN = /^[a-zA-Z0-9_-]+$/;

describe("suggestAliasFromDisplayName", () => {
  it("siempre produce un resultado que cumple el patron de aliasSchema", () => {
    const inputs = ["Álvaro", "  ", "李雷", "a", "John Smith Jr.", "O'Brien", "___", "Jean-Pierre"];
    for (const input of inputs) {
      const result = suggestAliasFromDisplayName(input);
      expect(result.length).toBeGreaterThanOrEqual(3);
      expect(result.length).toBeLessThanOrEqual(32);
      expect(result).toMatch(ALIAS_PATTERN);
    }
  });

  it("quita diacriticos en vez de perder la letra", () => {
    expect(suggestAliasFromDisplayName("Álvaro")).toBe("Alvaro");
  });

  it("sustituye espacios por guion bajo y colapsa repeticiones", () => {
    expect(suggestAliasFromDisplayName("John   Smith")).toBe("John_Smith");
  });

  it("conserva guiones internos validos", () => {
    expect(suggestAliasFromDisplayName("Jean-Pierre")).toBe("Jean-Pierre");
  });

  it("recorta separadores en los extremos", () => {
    expect(suggestAliasFromDisplayName("  Ana  ")).toBe("Ana");
  });

  it("genera un sufijo aleatorio cuando el nombre no aporta caracteres validos suficientes", () => {
    const result = suggestAliasFromDisplayName("李");
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result).toMatch(ALIAS_PATTERN);
  });

  it("nunca supera el maximo de 32 caracteres", () => {
    const long = "a".repeat(100);
    expect(suggestAliasFromDisplayName(long).length).toBeLessThanOrEqual(32);
  });
});
