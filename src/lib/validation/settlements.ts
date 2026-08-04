import { z } from "zod";
import { AMOUNT_REGEX } from "@/lib/validation/expenses";
import { SETTLEMENT_PAYMENT_METHODS } from "@/lib/settlements/methods";

export const createSettlementPaymentSchema = z
  .object({
    subgroupId: z.string().uuid().optional(),
    fromUserId: z.string().uuid(),
    toUserId: z.string().uuid(),
    amount: z.string().regex(AMOUNT_REGEX, "Importe invalido (usa formato 123.45)"),
    currencyCode: z
      .string()
      .trim()
      .toUpperCase()
      .length(3, "El codigo de moneda debe tener 3 letras (ISO 4217)"),
    method: z.enum(SETTLEMENT_PAYMENT_METHODS),
  })
  .refine((data) => data.fromUserId !== data.toUserId, {
    message: "El pagador y el receptor no pueden ser la misma persona",
    path: ["toUserId"],
  });

export type CreateSettlementPaymentInput = z.infer<typeof createSettlementPaymentSchema>;
