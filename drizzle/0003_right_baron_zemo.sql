CREATE TYPE "public"."ocr_job_status" AS ENUM('draft', 'queued', 'processing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "ocr_extraction_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_document_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"status" "ocr_job_status" DEFAULT 'draft' NOT NULL,
	"pipeline_version" text NOT NULL,
	"field_schema_version" text NOT NULL,
	"provider_key" text,
	"provider_job_id" text,
	"routing_manifest" jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_submission_field_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_field_id" uuid NOT NULL,
	"ocr_extraction_job_id" uuid,
	"source_document_id" uuid NOT NULL,
	"source_page" integer NOT NULL,
	"value_path" text DEFAULT '$' NOT NULL,
	"source_snippet" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_field_evidence_source_page_positive" CHECK ("property_submission_field_evidence"."source_page" > 0)
);
--> statement-breakpoint
ALTER TABLE "property_submission_fields" DROP CONSTRAINT "property_submission_fields_source_document_id_source_documents_id_fk";
--> statement-breakpoint
ALTER TABLE "ocr_extraction_jobs" ADD CONSTRAINT "ocr_extraction_jobs_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocr_extraction_jobs" ADD CONSTRAINT "ocr_extraction_jobs_submission_id_property_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."property_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_submission_field_evidence" ADD CONSTRAINT "property_submission_field_evidence_submission_field_id_property_submission_fields_id_fk" FOREIGN KEY ("submission_field_id") REFERENCES "public"."property_submission_fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_submission_field_evidence" ADD CONSTRAINT "property_submission_field_evidence_ocr_extraction_job_id_ocr_extraction_jobs_id_fk" FOREIGN KEY ("ocr_extraction_job_id") REFERENCES "public"."ocr_extraction_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_submission_field_evidence" ADD CONSTRAINT "property_submission_field_evidence_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ocr_extraction_jobs_document_id_idx" ON "ocr_extraction_jobs" USING btree ("source_document_id");--> statement-breakpoint
CREATE INDEX "ocr_extraction_jobs_submission_id_idx" ON "ocr_extraction_jobs" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "ocr_extraction_jobs_status_idx" ON "ocr_extraction_jobs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "ocr_extraction_jobs_provider_job_unique" ON "ocr_extraction_jobs" USING btree ("provider_key","provider_job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submission_field_evidence_source_unique" ON "property_submission_field_evidence" USING btree ("submission_field_id","source_document_id","source_page","value_path");--> statement-breakpoint
CREATE INDEX "submission_field_evidence_job_id_idx" ON "property_submission_field_evidence" USING btree ("ocr_extraction_job_id");--> statement-breakpoint
ALTER TABLE "property_submission_fields" DROP COLUMN "source_document_id";--> statement-breakpoint
ALTER TABLE "property_submission_fields" DROP COLUMN "source_page";--> statement-breakpoint
ALTER TABLE "property_submission_fields" DROP COLUMN "source_snippet";--> statement-breakpoint
ALTER TABLE "source_documents" DROP COLUMN "ocr_status";--> statement-breakpoint
ALTER TABLE "source_documents" DROP COLUMN "ocr_completed_at";--> statement-breakpoint
DROP TYPE "public"."ocr_status";--> statement-breakpoint
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_page_count_positive" CHECK ("source_documents"."page_count" is null or "source_documents"."page_count" > 0);
