-- Schema v7: a fetch job records which regulator answered, which project it found,
-- the submission it was run for, who asked, and why it failed. Additive only.
--
-- Trimmed by hand from the generated file: drizzle diffed against the 0008 snapshot
-- and so also re-emitted the tables and columns that the hand-written 0009 and 0010
-- already created. The 0011 snapshot now holds the full current schema.
ALTER TABLE "rera_fetch_jobs" ADD COLUMN "regulator_code" text DEFAULT 'gujrera' NOT NULL;--> statement-breakpoint
ALTER TABLE "rera_fetch_jobs" ADD COLUMN "external_project_id" text;--> statement-breakpoint
ALTER TABLE "rera_fetch_jobs" ADD COLUMN "submission_id" uuid;--> statement-breakpoint
ALTER TABLE "rera_fetch_jobs" ADD COLUMN "requested_by" text;--> statement-breakpoint
ALTER TABLE "rera_fetch_jobs" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "rera_fetch_jobs" ADD CONSTRAINT "rera_fetch_jobs_submission_id_property_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."property_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rera_fetch_jobs" ADD CONSTRAINT "rera_fetch_jobs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rera_fetch_jobs_submission_id_idx" ON "rera_fetch_jobs" USING btree ("submission_id");
