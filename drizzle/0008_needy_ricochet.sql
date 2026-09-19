CREATE TYPE "public"."ai_usage_kind" AS ENUM('page_router', 'ocr_extraction');--> statement-breakpoint
CREATE TYPE "public"."ai_usage_status" AS ENUM('succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "ai_usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "ai_usage_kind" NOT NULL,
	"status" "ai_usage_status" NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"provider_request_id" text,
	"scope_key" text,
	"ocr_job_id" uuid,
	"submission_id" uuid,
	"source_document_id" uuid,
	"developer_id" uuid,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"reasoning_tokens" integer,
	"cost_usd" numeric(12, 6),
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_usage_events_amounts_non_negative" CHECK (("ai_usage_events"."prompt_tokens" is null or "ai_usage_events"."prompt_tokens" >= 0)
        and ("ai_usage_events"."completion_tokens" is null or "ai_usage_events"."completion_tokens" >= 0)
        and ("ai_usage_events"."reasoning_tokens" is null or "ai_usage_events"."reasoning_tokens" >= 0)
        and ("ai_usage_events"."cost_usd" is null or "ai_usage_events"."cost_usd" >= 0))
);
--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_ocr_job_id_ocr_extraction_jobs_id_fk" FOREIGN KEY ("ocr_job_id") REFERENCES "public"."ocr_extraction_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_submission_id_property_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."property_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_events_created_at_idx" ON "ai_usage_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_events_developer_id_idx" ON "ai_usage_events" USING btree ("developer_id");--> statement-breakpoint
CREATE INDEX "ai_usage_events_submission_id_idx" ON "ai_usage_events" USING btree ("submission_id");
--> statement-breakpoint
-- Append-only ledger (docs/schema/schema.v6.md section 1): the application role
-- may read and insert rows but never update or delete them. Foreign-key
-- "on delete set null" actions run as the table owner, so deleting a draft or
-- developer still detaches the ledger rows without granting UPDATE here.
GRANT SELECT, INSERT ON TABLE public.ai_usage_events TO propcompare_app;
-- The local Docker and CI roles carry default privileges that hand the app role
-- full CRUD on every new public table, so the append-only guarantee needs an
-- explicit REVOKE (a no-op where no such default exists).
REVOKE UPDATE, DELETE ON TABLE public.ai_usage_events FROM propcompare_app;
