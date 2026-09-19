CREATE TYPE "public"."media_source_kind" AS ENUM('developer_brochure', 'own', 'developer_supplied');--> statement-breakpoint
ALTER TABLE "property_media" ADD COLUMN "attribution" text;--> statement-breakpoint
ALTER TABLE "property_media" ADD COLUMN "source_kind" "media_source_kind";--> statement-breakpoint
CREATE TABLE "property_submission_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"source_document_id" uuid,
	"uploaded_by" text,
	"reviewed_by" text,
	"unit_variant_name" text,
	"media_type" "media_type" NOT NULL,
	"source_kind" "media_source_kind" NOT NULL,
	"gcs_path" text NOT NULL,
	"caption" text,
	"attribution" text NOT NULL,
	"display_order" integer NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"review_status" "field_review_status" DEFAULT 'needs_review' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "property_submission_media_display_order_non_negative" CHECK ("property_submission_media"."display_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "property_submission_media" ADD CONSTRAINT "property_submission_media_submission_id_property_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."property_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_submission_media" ADD CONSTRAINT "property_submission_media_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_submission_media" ADD CONSTRAINT "property_submission_media_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_submission_media" ADD CONSTRAINT "property_submission_media_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "property_submission_media_submission_order_unique" ON "property_submission_media" USING btree ("submission_id","display_order");--> statement-breakpoint
CREATE INDEX "property_submission_media_submission_id_idx" ON "property_submission_media" USING btree ("submission_id");
