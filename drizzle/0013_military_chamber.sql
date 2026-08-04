ALTER TABLE "group_invitations" ADD COLUMN "external_provider" varchar(32);--> statement-breakpoint
ALTER TABLE "group_invitations" ADD COLUMN "external_participant_id" varchar(64);