import { z } from "zod";

export const AMOUNT_REGEX = /^\d+(?:\.\d{1,2})?$/;
export const PERCENTAGE_REGEX = /^\d{1,3}(?:\.\d{1,2})?$/;

const amountSchema = z.string().regex(AMOUNT_REGEX, "Importe invalido (usa formato 123.45)");
const percentageSchema = z.string().regex(PERCENTAGE_REGEX, "Porcentaje invalido (usa formato 33.33)");

const equalSplitSchema = z.object({
  method: z.literal("equal"),
  participantUserIds: z
    .array(z.string().uuid())
    .min(1, "Selecciona al menos un participante"),
});

const percentageSplitSchema = z.object({
  method: z.literal("percentage"),
  shares: z
    .array(z.object({ userId: z.string().uuid(), percentage: percentageSchema }))
    .min(1, "Selecciona al menos un participante"),
});

const fixedSplitSchema = z.object({
  method: z.literal("fixed"),
  shares: z
    .array(z.object({ userId: z.string().uuid(), amount: amountSchema }))
    .min(1, "Selecciona al menos un participante"),
});

export const splitSchema = z.discriminatedUnion("method", [
  equalSplitSchema,
  percentageSplitSchema,
  fixedSplitSchema,
]);

const totalAmountSchema = amountSchema.refine((val) => Number(val) > 0, "El importe debe ser mayor que 0");

export const createExpenseSchema = z.object({
  payerId: z.string().uuid(),
  amount: totalAmountSchema,
  currencyCode: z
    .string()
    .trim()
    .toUpperCase()
    .length(3, "El codigo de moneda debe tener 3 letras (ISO 4217)"),
  description: z.string().trim().min(1, "La descripcion es obligatoria").max(280),
  expenseDate: z.iso.date(),
  subgroupId: z.string().uuid().optional(),
  split: splitSchema,
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type SplitInput = z.infer<typeof splitSchema>;
