CREATE TABLE "rate_limit_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar(32) NOT NULL,
	"key" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "rate_limit_attempts_scope_key_created_at_idx" ON "rate_limit_attempts" USING btree ("scope","key","created_at");