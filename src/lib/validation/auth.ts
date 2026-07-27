import { z } from "zod";

export const aliasSchema = z
  .string()
  .trim()
  .min(3, "El alias debe tener al menos 3 caracteres")
  .max(32, "El alias no puede superar 32 caracteres")
  .regex(/^[a-zA-Z0-9_-]+$/, "El alias solo puede contener letras, numeros, '_' y '-'");

export const passwordSchema = z
  .string()
  .min(10, "La contrasena debe tener al menos 10 caracteres")
  .max(128, "La contrasena es demasiado larga");

export const registerSchema = z.object({
  alias: aliasSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  alias: aliasSchema,
  password: z.string().min(1, "La contrasena es obligatoria"),
});

export const recoverSchema = z.object({
  alias: aliasSchema,
  recoveryCode: z.string().min(1, "El codigo de recuperacion es obligatorio"),
  newPassword: passwordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RecoverInput = z.infer<typeof recoverSchema>;
