import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { encryptSecret, decryptSecret } from "./secret-box";

describe("secret-box", () => {
  const ORIGINAL_KEY = process.env.IMPORT_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.IMPORT_ENCRYPTION_KEY = "0".repeat(64);
  });

  afterEach(() => {
    process.env.IMPORT_ENCRYPTION_KEY = ORIGINAL_KEY;
  });

  it("descifra exactamente lo que se cifro", () => {
    const plaintext = "splitwise-access-token-super-secreto";
    const encrypted = encryptSecret(plaintext);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it("produce un IV distinto en cada cifrado (mismo texto, salida distinta)", () => {
    const a = encryptSecret("mismo-texto");
    const b = encryptSecret("mismo-texto");
    expect(a).not.toBe(b);
  });

  it("lanza si falta IMPORT_ENCRYPTION_KEY", () => {
    delete process.env.IMPORT_ENCRYPTION_KEY;
    expect(() => encryptSecret("x")).toThrow(/no esta configurada/);
  });

  it("lanza si la clave no tiene 32 bytes", () => {
    process.env.IMPORT_ENCRYPTION_KEY = "abcd";
    expect(() => encryptSecret("x")).toThrow();
  });

  it("lanza si el ciphertext ha sido manipulado (autenticacion GCM)", () => {
    const encrypted = encryptSecret("dato-sensible");
    const tampered = encrypted.slice(0, -4) + "AAAA";
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("lanza con un formato invalido", () => {
    expect(() => decryptSecret("no-es-el-formato-esperado")).toThrow(/formato/i);
  });
});
