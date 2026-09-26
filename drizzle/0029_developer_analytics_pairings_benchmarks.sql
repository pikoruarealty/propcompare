CREATE TABLE "developer_analytics_benchmarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"window" text NOT NULL,
	"window_start" date NOT NULL,
	"window_end" date NOT NULL,
	"developer_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"cohort" text NOT NULL,
	"cohort_properties" smallint NOT NULL,
	"cohort_developers" smallint NOT NULL,
	"median" numeric NOT NULL,
	CONSTRAINT "developer_analytics_benchmarks_unique" UNIQUE("run_id","window","property_id","metric"),
	CONSTRAINT "developer_analytics_benchmarks_window" CHECK ("developer_analytics_benchmarks"."window" in ('7d', '30d', 'qtd', 'ytd', '12m')
        and "developer_analytics_benchmarks"."window_start" <= "developer_analytics_benchmarks"."window_end"),
	CONSTRAINT "developer_analytics_benchmarks_metric" CHECK ("developer_analytics_benchmarks"."metric" in ('visitors', 'viewers', 'comparers', 'savers')),
	CONSTRAINT "developer_analytics_benchmarks_cohort" CHECK ("developer_analytics_benchmarks"."cohort" in ('locality', 'city')),
	CONSTRAINT "developer_analytics_benchmarks_size" CHECK ("developer_analytics_benchmarks"."cohort_properties" >= 1
        and "developer_analytics_benchmarks"."cohort_developers" between 1 and "developer_analytics_benchmarks"."cohort_properties"
        and "developer_analytics_benchmarks"."median" >= 0)
);
--> statement-breakpoint
CREATE TABLE "developer_analytics_pairings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"window" text NOT NULL,
	"window_start" date NOT NULL,
	"window_end" date NOT NULL,
	"developer_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"rival_property_id" uuid NOT NULL,
	"visitors" integer NOT NULL,
	CONSTRAINT "developer_analytics_pairings_unique" UNIQUE("run_id","window","property_id","rival_property_id"),
	CONSTRAINT "developer_analytics_pairings_window" CHECK ("developer_analytics_pairings"."window" in ('7d', '30d', 'qtd', 'ytd', '12m')
        and "developer_analytics_pairings"."window_start" <= "developer_analytics_pairings"."window_end"),
	CONSTRAINT "developer_analytics_pairings_distinct" CHECK ("developer_analytics_pairings"."property_id" <> "developer_analytics_pairings"."rival_property_id"),
	CONSTRAINT "developer_analytics_pairings_visitors" CHECK ("developer_analytics_pairings"."visitors" >= 1)
);
--> statement-breakpoint
ALTER TABLE "developer_analytics_benchmarks" ADD CONSTRAINT "developer_analytics_benchmarks_run_id_developer_analytics_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."developer_analytics_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_analytics_benchmarks" ADD CONSTRAINT "developer_analytics_benchmarks_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_analytics_benchmarks" ADD CONSTRAINT "developer_analytics_benchmarks_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_analytics_pairings" ADD CONSTRAINT "developer_analytics_pairings_run_id_developer_analytics_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."developer_analytics_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_analytics_pairings" ADD CONSTRAINT "developer_analytics_pairings_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_analytics_pairings" ADD CONSTRAINT "developer_analytics_pairings_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_analytics_pairings" ADD CONSTRAINT "developer_analytics_pairings_rival_property_id_properties_id_fk" FOREIGN KEY ("rival_property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "developer_analytics_benchmarks_developer_idx" ON "developer_analytics_benchmarks" USING btree ("developer_id","run_id");--> statement-breakpoint
CREATE INDEX "developer_analytics_pairings_developer_idx" ON "developer_analytics_pairings" USING btree ("developer_id","run_id");--> statement-breakpoint
-- Named rival properties and peer benchmarks (docs/schema/schema.v23.md, DECISIONS.md
-- 2026-09-26). Same boundary as the two v21 tables: the release job writes them as the
-- application role, and developer analytics code reads them through the read-only
-- reader role, which still holds nothing else.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.developer_analytics_pairings, public.developer_analytics_benchmarks TO propcompare_app;--> statement-breakpoint
GRANT SELECT ON TABLE public.developer_analytics_pairings, public.developer_analytics_benchmarks TO propcompare_developer_reader;
