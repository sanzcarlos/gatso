ALTER TABLE "audit_logs" ALTER COLUMN "entity_id" SET DATA TYPE varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_platform_admin" boolean DEFAULT false NOT NULL;