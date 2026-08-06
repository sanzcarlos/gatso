import { z } from "zod";

export const updatePlatformAdminSchema = z.object({
  isPlatformAdmin: z.boolean(),
});

export type UpdatePlatformAdminInput = z.infer<typeof updatePlatformAdminSchema>;
