ALTER TABLE "expenses" ADD COLUMN "client_request_id" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_client_request_id_idx" ON "expenses" USING btree ("client_request_id");