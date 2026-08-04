import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "El usuario debe tener al menos 3 caracteres")
  .max(32, "El usuario no puede superar 32 caracteres")
  .regex(/^[a-zA-Z0-9_-]+$/, "El usuario solo puede contener letras, numeros, '_' y '-'");

/**
 * Nombre visible (Fase de identidad): a diferencia de `usernameSchema`
 * (credencial de acceso, patron restringido y unico), el nombre visible
 * no necesita ser unico ni seguir un patron de slug -es texto libre-,
 * solo una longitud razonable. Editable por el propio usuario en
 * cualquier momento.
 */
export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "El nombre visible no puede estar vacio")
  .max(64, "El nombre visible no puede superar 64 caracteres");

export const passwordSchema = z
  .string()
  .min(10, "La contrasena debe tener al menos 10 caracteres")
  .max(128, "La contrasena es demasiado larga");

export const registerSchema = z.object({
  username: usernameSchema,
  /** Si se omite, se usa el propio username como nombre visible inicial. */
  displayName: displayNameSchema.optional(),
  password: passwordSchema,
});

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, "La contrasena es obligatoria"),
});

export const recoverSchema = z.object({
  username: usernameSchema,
  recoveryCode: z.string().min(1, "El codigo de recuperacion es obligatorio"),
  newPassword: passwordSchema,
});

export const updateDisplayNameSchema = z.object({
  displayName: displayNameSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RecoverInput = z.infer<typeof recoverSchema>;
export type UpdateDisplayNameInput = z.infer<typeof updateDisplayNameSchema>;
