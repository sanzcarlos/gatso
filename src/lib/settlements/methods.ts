/**
 * Metodos de pago disponibles para registrar que una deuda sugerida por la
 * liquidacion (Fase 9) se ha saldado realmente fuera de la app (Fase 9 ampliada).
 * Modulo "puro" (sin dependencias de servidor/base de datos) para poder
 * importarlo tanto desde el esquema (`src/db/schema/settlement-payments.ts`)
 * como desde componentes cliente (`src/components/settlement-card.tsx`).
 */
export const SETTLEMENT_PAYMENT_METHODS = ["cash", "bizum", "transfer"] as const;

export type SettlementPaymentMethod = (typeof SETTLEMENT_PAYMENT_METHODS)[number];

export const SETTLEMENT_METHOD_LABEL: Record<SettlementPaymentMethod, string> = {
  cash: "Efectivo",
  bizum: "Bizum",
  transfer: "Transferencia",
};
