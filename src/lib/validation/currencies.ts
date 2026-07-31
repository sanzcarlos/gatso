import { z } from "zod";

export const CURRENCY_CODE_REGEX = /^[A-Z]{3}$/;

export const currencyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(CURRENCY_CODE_REGEX, "El codigo de moneda debe tener 3 letras mayusculas (ISO 4217)");

export const createCurrencySchema = z.object({
  code: currencyCodeSchema,
  name: z.string().trim().min(1, "El nombre es obligatorio").max(64),
  symbol: z.string().trim().min(1, "El simbolo es obligatorio").max(8),
  decimalDigits: z.number().int().min(0).max(4).default(2),
});

export const updateCurrencyStatusSchema = z.object({
  isActive: z.boolean(),
});

export type CreateCurrencyInput = z.infer<typeof createCurrencySchema>;
export type UpdateCurrencyStatusInput = z.infer<typeof updateCurrencyStatusSchema>;
