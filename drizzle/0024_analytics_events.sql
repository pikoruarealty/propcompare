CREATE TABLE "analytics_event_monthly" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month" date NOT NULL,
	"event" text NOT NULL,
	"property_id" uuid,
	"events" integer NOT NULL,
	"visitors" integer NOT NULL,
	"engaged_ms" bigint NOT NULL,
	CONSTRAINT "analytics_event_monthly_unique" UNIQUE NULLS NOT DISTINCT("month","event","property_id")
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"visitor_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"event" text NOT NULL,
	"signed_in" boolean NOT NULL,
	"property_id" uuid,
	"compared_ids" uuid[],
	"engaged_ms" integer,
	"detail" jsonb,
	"device" text NOT NULL,
	"source" text,
	"medium" text,
	"campaign" text,
	"referrer_domain" text,
	"budget_band" text,
	CONSTRAINT "analytics_events_engaged_ms_range" CHECK ("analytics_events"."engaged_ms" is null or ("analytics_events"."engaged_ms" >= 0 and "analytics_events"."engaged_ms" <= 1800000))
);
--> statement-breakpoint
CREATE TABLE "analytics_pair_monthly" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month" date NOT NULL,
	"property_a" uuid NOT NULL,
	"property_b" uuid NOT NULL,
	"comparisons" integer NOT NULL,
	"visitors" integer NOT NULL,
	CONSTRAINT "analytics_pair_monthly_ordered" CHECK ("analytics_pair_monthly"."property_a" < "analytics_pair_monthly"."property_b")
);
--> statement-breakpoint
ALTER TABLE "analytics_event_monthly" ADD CONSTRAINT "analytics_event_monthly_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_pair_monthly" ADD CONSTRAINT "analytics_pair_monthly_property_a_properties_id_fk" FOREIGN KEY ("property_a") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_pair_monthly" ADD CONSTRAINT "analytics_pair_monthly_property_b_properties_id_fk" FOREIGN KEY ("property_b") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_events_occurred_at_idx" ON "analytics_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_events_event_occurred_idx" ON "analytics_events" USING btree ("event","occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_events_property_idx" ON "analytics_events" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_pair_monthly_unique" ON "analytics_pair_monthly" USING btree ("month","property_a","property_b");--> statement-breakpoint
-- Raw events (docs/schema/schema.v20.md): the application role records and reads
-- them, and deletes them only for the 13-month retention; it never rewrites one.
-- The local Docker and CI roles carry default privileges granting full CRUD on new
-- public tables, so UPDATE is revoked explicitly (a no-op where no such default
-- exists), as for ai_usage_events.
GRANT SELECT, INSERT, DELETE ON TABLE public.analytics_events TO propcompare_app;--> statement-breakpoint
REVOKE UPDATE ON TABLE public.analytics_events FROM propcompare_app;--> statement-breakpoint
-- The monthly counts are added to (upsert) and read, never deleted by the app.
GRANT SELECT, INSERT, UPDATE ON TABLE public.analytics_event_monthly, public.analytics_pair_monthly TO propcompare_app;--> statement-breakpoint
REVOKE DELETE ON TABLE public.analytics_event_monthly, public.analytics_pair_monthly FROM propcompare_app;
