CREATE TYPE "public"."auth_attempt_action" AS ENUM('login', 'recover');--> statement-breakpoint
CREATE TABLE "auth_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alias" varchar(32) NOT NULL,
	"action" "auth_attempt_action" NOT NULL,
	"success" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auth_attempts_alias_action_created_at_idx" ON "auth_attempts" USING btree ("alias","action","created_at");