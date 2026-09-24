CREATE TABLE "private"."rera_price_ranges" (
	"registration_number" text PRIMARY KEY NOT NULL,
	"regulator_code" text NOT NULL,
	"min_inr" numeric NOT NULL,
	"max_inr" numeric NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "private"."staged_unit_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"unit_variant_name" text NOT NULL,
	"price_inr" numeric NOT NULL,
	"entered_by" text NOT NULL,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "private"."staged_unit_prices" ADD CONSTRAINT "staged_unit_prices_submission_id_property_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."property_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."staged_unit_prices" ADD CONSTRAINT "staged_unit_prices_entered_by_users_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staged_unit_prices_one_per_name_unique" ON "private"."staged_unit_prices" USING btree ("submission_id","unit_variant_name");--> statement-breakpoint
-- The two new tables follow the private schema's rule (0000, 0002): row-level
-- security on and forced with no policies, the normal app role denied everything,
-- the service role the only reader and writer.
ALTER TABLE "private"."rera_price_ranges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "private"."rera_price_ranges" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "private"."staged_unit_prices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "private"."staged_unit_prices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "private"."rera_price_ranges" FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON TABLE "private"."rera_price_ranges" FROM propcompare_app;--> statement-breakpoint
REVOKE ALL ON TABLE "private"."staged_unit_prices" FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON TABLE "private"."staged_unit_prices" FROM propcompare_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "private"."rera_price_ranges" TO propcompare_service;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "private"."staged_unit_prices" TO propcompare_service;--> statement-breakpoint
-- The pricing module and the matcher tie a price range to a property by its RERA
-- registration number, and apply a staged price to the property's live unit types.
-- Column-level, so the service role reads nothing else about a property.
GRANT SELECT ("id", "rera_registration_number") ON TABLE "public"."properties" TO propcompare_service;
