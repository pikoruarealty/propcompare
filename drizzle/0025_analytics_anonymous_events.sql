ALTER TABLE "analytics_events" ALTER COLUMN "visitor_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_events" ALTER COLUMN "session_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN "anonymised_at" timestamp with time zone;--> statement-breakpoint
-- Raw events are now kept and anonymised rather than deleted (docs/schema/schema.v21.md):
-- the retention job may clear the two ids and stamp anonymised_at, nothing else.
-- Nothing in the application deletes an event any more.
GRANT UPDATE (visitor_id, session_id, anonymised_at) ON TABLE public.analytics_events TO propcompare_app;--> statement-breakpoint
REVOKE DELETE ON TABLE public.analytics_events FROM propcompare_app;
