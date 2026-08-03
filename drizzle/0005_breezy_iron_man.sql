CREATE TABLE "exchange_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"currency_code" varchar(3) NOT NULL,
	"rate_to_eur" numeric(18, 6) NOT NULL,
	"as_of_date" date NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "base_currency_code" varchar(3) DEFAULT 'EUR' NOT NULL;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_currency_code_currencies_code_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_rates_currency_date_idx" ON "exchange_rates" USING btree ("currency_code","as_of_date");--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_base_currency_code_currencies_code_fk" FOREIGN KEY ("base_currency_code") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;