DROP VIEW "private"."unit_current_bucket";
--> statement-breakpoint
ALTER TABLE "public"."budget_buckets" SET SCHEMA "private";
--> statement-breakpoint
REVOKE ALL ON TABLE "private"."budget_buckets" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE "private"."budget_buckets" FROM propcompare_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "private"."budget_buckets" TO propcompare_service;
--> statement-breakpoint
ALTER TABLE "private"."budget_buckets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "private"."budget_buckets" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE VIEW "private"."unit_current_bucket" WITH (security_invoker = true) AS
SELECT uv.id AS unit_variant_id, bb.id AS budget_bucket_id
FROM public.unit_variants AS uv
JOIN private.unit_price_history AS ph
  ON ph.unit_variant_id = uv.id AND ph.effective_to IS NULL
JOIN private.budget_buckets AS bb
  ON ph.price_inr >= bb.min_inr AND ph.price_inr < bb.max_inr;
--> statement-breakpoint
GRANT SELECT ON TABLE "private"."unit_current_bucket" TO propcompare_service;
