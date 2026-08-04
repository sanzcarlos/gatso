import { z } from "zod";

export const previewSplitwiseSchema = z.object({
  sourceGroupExternalId: z.string().trim().min(1, "Falta el grupo de Splitwise a previsualizar"),
});

export type PreviewSplitwiseInput = z.infer<typeof previewSplitwiseSchema>;

const participantMappingSchema = z.object({
  externalId: z.string().trim().min(1),
  gatsoUserId: z.string().uuid(),
});

export const createSplitwiseImportJobSchema = z
  .object({
    sourceGroupExternalId: z.string().trim().min(1, "Falta el grupo de Splitwise a importar"),
    sourceGroupName: z.string().trim().min(1).max(64),
    createMode: z.enum(["create", "existing"]),
    targetGroupId: z.string().uuid().optional(),
    targetGroupName: z.string().trim().max(64).optional(),
    baseCurrencyCode: z
      .string()
      .trim()
      .toUpperCase()
      .length(3, "El codigo de moneda debe tener 3 letras")
      .optional(),
    participantMappings: z.array(participantMappingSchema).min(1, "Debes mapear al menos un participante"),
  })
  .refine((data) => data.createMode !== "existing" || Boolean(data.targetGroupId), {
    message: "Falta el grupo Gatso donde importar",
    path: ["targetGroupId"],
  });

export type CreateSplitwiseImportJobInput = z.infer<typeof createSplitwiseImportJobSchema>;
