import { z } from "zod";
import { aliasSchema, passwordSchema } from "./auth";

export const GROUP_MAX_MEMBERS = 64;
export const GROUP_MAX_SUBGROUPS = 32;

export const groupNameSchema = z
  .string()
  .trim()
  .min(1, "El nombre del grupo es obligatorio")
  .max(64, "El nombre del grupo no puede superar 64 caracteres");

export const subgroupNameSchema = z
  .string()
  .trim()
  .min(1, "El nombre del subgrupo es obligatorio")
  .max(64, "El nombre del subgrupo no puede superar 64 caracteres");

export const createGroupSchema = z.object({
  name: groupNameSchema,
  baseCurrencyCode: z.string().trim().toUpperCase().length(3, "El codigo de moneda debe tener 3 letras").default("EUR"),
});

export const updateGroupSchema = z.object({
  name: groupNameSchema,
});

export const createSubgroupSchema = z.object({
  name: subgroupNameSchema,
});

export const joinGroupSchema = z.object({
  inviteCode: z.string().trim().min(1, "El codigo de invitacion es obligatorio"),
});

/**
 * `suggestedAlias` es solo una sugerencia mostrada en el formulario de
 * aceptacion (ej. nombre de un participante importado de Splitwise, Fase
 * 11): deliberadamente mas permisivo que `aliasSchema` (no exige el
 * patron final de alias, la persona invitada puede editarlo libremente
 * antes de aceptar).
 */
export const createInvitationSchema = z.object({
  suggestedAlias: z.string().trim().max(64, "Maximo 64 caracteres").optional(),
});

export const acceptInvitationSchema = z.object({
  alias: aliasSchema,
  password: passwordSchema,
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type CreateSubgroupInput = z.infer<typeof createSubgroupSchema>;
export type JoinGroupInput = z.infer<typeof joinGroupSchema>;
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
