import { z } from "zod";

export const previewSplitwiseSchema = z.object({
  sourceGroupExternalId: z.string().trim().min(1, "Falta el grupo de Splitwise a previsualizar"),
});

export type PreviewSplitwiseInput = z.infer<typeof previewSplitwiseSchema>;
