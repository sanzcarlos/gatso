-- Fase de identidad: separa el antiguo `alias` unico en dos conceptos:
-- `username` (credencial de acceso, inmutable en la practica, unica) y
-- `display_name` (nombre visible, editable en cualquier momento). Se
-- usa RENAME + ADD + backfill (nunca DROP) para no perder ningun dato
-- de usuarios ya existentes.

-- users: alias -> username (rename conserva la constraint UNIQUE con
-- su nombre original "users_alias_unique"; se renombra tambien por
-- claridad, aunque Postgres seguiria funcionando igual sin hacerlo).
ALTER TABLE "users" RENAME COLUMN "alias" TO "username";
--> statement-breakpoint
ALTER TABLE "users" RENAME CONSTRAINT "users_alias_unique" TO "users_username_unique";
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "display_name" varchar(64);
--> statement-breakpoint
UPDATE "users" SET "display_name" = "username" WHERE "display_name" IS NULL;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "display_name" SET NOT NULL;
--> statement-breakpoint

-- auth_attempts: alias -> username (mismo criterio, credencial no nombre visible).
ALTER TABLE "auth_attempts" RENAME COLUMN "alias" TO "username";
--> statement-breakpoint
ALTER INDEX "auth_attempts_alias_action_created_at_idx" RENAME TO "auth_attempts_username_action_created_at_idx";
--> statement-breakpoint

-- group_invitations: suggested_alias -> suggested_display_name (es una
-- sugerencia de NOMBRE visible prellenado en el formulario de
-- aceptacion, nunca fue una sugerencia de credencial de acceso).
ALTER TABLE "group_invitations" RENAME COLUMN "suggested_alias" TO "suggested_display_name";
