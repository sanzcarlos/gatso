CREATE TYPE "public"."import_job_status" AS ENUM('draft', 'preview', 'running', 'completed', 'partial', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "external_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(32) NOT NULL,
	"external_user_id" varchar(64),
	"access_token_encrypted" text NOT NULL,
	"refresh_token_encrypted" text,
	"token_type" varchar(32) DEFAULT 'bearer' NOT NULL,
	"scope" varchar(256),
	"expires_at" timestamp with time zone,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "external_entity_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(32) NOT NULL,
	"entity_type" varchar(16) NOT NULL,
	"external_id" varchar(64) NOT NULL,
	"gatso_id" uuid NOT NULL,
	"external_version" varchar(64),
	"created_by_job_id" uuid,
	"last_imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_job_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_job_id" uuid NOT NULL,
	"entity_type" varchar(16) NOT NULL,
	"external_id" varchar(64),
	"message" varchar(500) NOT NULL,
	"recoverable" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(32) NOT NULL,
	"status" "import_job_status" DEFAULT 'draft' NOT NULL,
	"source_group_external_id" varchar(64) NOT NULL,
	"create_mode" varchar(16) DEFAULT 'create' NOT NULL,
	"target_group_id" uuid,
	"cursor" varchar(256),
	"total_estimated" integer,
	"imported_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"error_summary" text,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "external_connections" ADD CONSTRAINT "external_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_entity_mappings" ADD CONSTRAINT "external_entity_mappings_created_by_job_id_import_jobs_id_fk" FOREIGN KEY ("created_by_job_id") REFERENCES "public"."import_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_job_errors" ADD CONSTRAINT "import_job_errors_import_job_id_import_jobs_id_fk" FOREIGN KEY ("import_job_id") REFERENCES "public"."import_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_target_group_id_groups_id_fk" FOREIGN KEY ("target_group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "external_connections_user_provider_idx" ON "external_connections" USING btree ("user_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "external_entity_mappings_provider_type_external_idx" ON "external_entity_mappings" USING btree ("provider","entity_type","external_id");