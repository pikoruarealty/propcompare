CREATE TABLE "developer_analytics_released" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"window" text NOT NULL,
	"window_start" date NOT NULL,
	"window_end" date NOT NULL,
	"developer_id" uuid NOT NULL,
	"property_id" uuid,
	"metric" text NOT NULL,
	"dimension" text NOT NULL,
	"dimension_value" text,
	"released" boolean NOT NULL,
	"value" numeric,
	CONSTRAINT "developer_analytics_released_unique" UNIQUE NULLS NOT DISTINCT("run_id","window","developer_id","property_id","metric","dimension","dimension_value"),
	CONSTRAINT "developer_analytics_released_window" CHECK ("developer_analytics_released"."window" in ('7d', '30d', 'qtd', 'ytd', '12m')
        and "developer_analytics_released"."window_start" <= "developer_analytics_released"."window_end"),
	CONSTRAINT "developer_analytics_released_metric" CHECK ("developer_analytics_released"."metric" in ('visitors', 'viewers', 'comparers', 'savers', 'unlockers', 'visits', 'returning_visitors', 'median_dossier_seconds', 'median_compare_seconds', 'enquirers', 'enquirers_comparing')),
	CONSTRAINT "developer_analytics_released_portfolio_only" CHECK ("developer_analytics_released"."metric" not in ('enquirers', 'enquirers_comparing')
        or ("developer_analytics_released"."property_id" is null and "developer_analytics_released"."dimension" = 'none')),
	CONSTRAINT "developer_analytics_released_dimension" CHECK (("developer_analytics_released"."dimension" = 'none' and "developer_analytics_released"."dimension_value" is null)
        or ("developer_analytics_released"."dimension" = 'device' and "developer_analytics_released"."dimension_value" in ('mobile', 'tablet', 'desktop'))
        or ("developer_analytics_released"."dimension" = 'budget_band' and "developer_analytics_released"."dimension_value" in ('Up to ₹50 lakh', '₹50–75 lakh', '₹75 lakh–1 crore', '₹1–1.5 crore', '₹1.5–2 crore', '₹2–3 crore', '₹3–5 crore', '₹5 crore or more'))),
	CONSTRAINT "developer_analytics_released_value" CHECK ("developer_analytics_released"."released" = ("developer_analytics_released"."value" is not null)
        and ("developer_analytics_released"."value" is null or "developer_analytics_released"."value" >= 0))
);
--> statement-breakpoint
CREATE TABLE "developer_analytics_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"data_through" date NOT NULL,
	"tracking_since" timestamp with time zone,
	"min_visitors" smallint NOT NULL,
	"rules_version" text NOT NULL,
	"error_code" text,
	CONSTRAINT "developer_analytics_runs_status" CHECK ("developer_analytics_runs"."status" in ('running', 'succeeded', 'failed')),
	CONSTRAINT "developer_analytics_runs_finished" CHECK (("developer_analytics_runs"."status" = 'running') = ("developer_analytics_runs"."finished_at" is null)),
	CONSTRAINT "developer_analytics_runs_error" CHECK (("developer_analytics_runs"."status" = 'failed') = ("developer_analytics_runs"."error_code" is not null)
        and ("developer_analytics_runs"."error_code" is null or "developer_analytics_runs"."error_code" ~ '^[a-z0-9_]{1,40}$')),
	CONSTRAINT "developer_analytics_runs_min_visitors" CHECK ("developer_analytics_runs"."min_visitors" >= 1),
	CONSTRAINT "developer_analytics_runs_rules_version" CHECK ("developer_analytics_runs"."rules_version" ~ '^[a-z0-9.-]{1,40}$')
);
--> statement-breakpoint
ALTER TABLE "developer_analytics_released" ADD CONSTRAINT "developer_analytics_released_run_id_developer_analytics_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."developer_analytics_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_analytics_released" ADD CONSTRAINT "developer_analytics_released_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_analytics_released" ADD CONSTRAINT "developer_analytics_released_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "developer_analytics_released_developer_idx" ON "developer_analytics_released" USING btree ("developer_id","run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "developer_analytics_runs_one_running" ON "developer_analytics_runs" USING btree ("status") WHERE "developer_analytics_runs"."status" = 'running';--> statement-breakpoint
CREATE INDEX "developer_analytics_runs_finished_idx" ON "developer_analytics_runs" USING btree ("status","finished_at");--> statement-breakpoint
-- Released developer analytics (docs/schema/schema.v21.md, DECISIONS.md 2026-09-26).
-- The release job runs as the application role, like the analytics purge: it reads
-- the raw v20 events it already may, and writes, replaces and prunes these rows.
-- Granted explicitly rather than relying on the local default privileges, so a
-- production database without them gets the same rights.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.developer_analytics_runs, public.developer_analytics_released TO propcompare_app;--> statement-breakpoint
-- Developer analytics code reads through its own role, which can select these two
-- tables and nothing else: no raw event, no catalog table, no account, no private
-- schema. Provisioned by docker/postgres-init/02-roles.sql (and by deployment);
-- if the role is missing this grant fails and the migration stops, rather than
-- leaving the boundary half built.
GRANT SELECT ON TABLE public.developer_analytics_runs, public.developer_analytics_released TO propcompare_developer_reader;
