-- Developers see no enquiry figure at all (DECISIONS.md 2026-09-26, schema v21):
-- they receive forwarded enquiries, so even a portfolio count could be tied to
-- named buyers. The two enquiry metrics leave the allowed list, and the rule that
-- kept them at portfolio level goes with them.
ALTER TABLE "developer_analytics_released" DROP CONSTRAINT "developer_analytics_released_portfolio_only";--> statement-breakpoint
ALTER TABLE "developer_analytics_released" DROP CONSTRAINT "developer_analytics_released_metric";--> statement-breakpoint
-- Derived data only, and nothing has written an enquiry figure yet; cleared so the
-- narrower check below can be added on any database.
DELETE FROM "developer_analytics_released" WHERE "metric" IN ('enquirers', 'enquirers_comparing');--> statement-breakpoint
ALTER TABLE "developer_analytics_released" ADD CONSTRAINT "developer_analytics_released_metric" CHECK ("developer_analytics_released"."metric" in ('visitors', 'viewers', 'comparers', 'savers', 'unlockers', 'visits', 'returning_visitors', 'median_dossier_seconds', 'median_compare_seconds'));