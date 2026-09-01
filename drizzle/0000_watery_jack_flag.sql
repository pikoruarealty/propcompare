CREATE TYPE "public"."admin_permission_level" AS ENUM('verifier', 'owner');--> statement-breakpoint
CREATE TYPE "public"."area_basis" AS ENUM('carpet', 'super_built_up', 'built_up');--> statement-breakpoint
CREATE TYPE "public"."catalog_item_status" AS ENUM('available', 'not_stated', 'explicitly_not_offered');--> statement-breakpoint
CREATE TYPE "public"."developer_user_status" AS ENUM('active', 'invited', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('brochure_pdf', 'rera_extract', 'floor_plan', 'possession_proof', 'other');--> statement-breakpoint
CREATE TYPE "public"."enquiry_status" AS ENUM('new', 'contacted', 'closed');--> statement-breakpoint
CREATE TYPE "public"."field_review_status" AS ENUM('auto_accepted', 'needs_review', 'confirmed', 'edited', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('photo', 'floor_plan', 'video', 'brochure_pdf');--> statement-breakpoint
CREATE TYPE "public"."ocr_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."possession_status" AS ENUM('under_construction', 'ready_to_move', 'nearing_possession');--> statement-breakpoint
CREATE TYPE "public"."rera_fetch_job_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."review_verification_status" AS ENUM('unverified', 'verified');--> statement-breakpoint
CREATE TYPE "public"."submission_source" AS ENUM('manual_form', 'ocr_brochure', 'rera_scrape');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('draft', 'submitted', 'in_review', 'changes_requested', 'approved', 'rejected', 'published');--> statement-breakpoint
CREATE TYPE "private"."price_source" AS ENUM('developer_submission', 'admin_manual', 'rera_extract');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"phone_number" text,
	"phone_number_verified" boolean,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_number_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"permission_level" "admin_permission_level" NOT NULL,
	"mfa_enforced" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "amenity_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"category" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "amenity_synonyms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"amenity_catalog_id" uuid NOT NULL,
	"synonym_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bhk_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"bedroom_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_buckets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"min_inr" numeric NOT NULL,
	"max_inr" numeric NOT NULL,
	"display_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buyer_intake_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"persona_priorities" jsonb NOT NULL,
	"desired_bhk_type_id" uuid,
	"budget_min_inr" numeric,
	"budget_max_inr" numeric,
	"city" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buyer_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"phone_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comparison_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comparison_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"unit_variant_id" uuid,
	"display_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comparisons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "developer_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"developer_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"title" text,
	"status" "developer_user_status" DEFAULT 'invited' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "developers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"rera_developer_id" text,
	"description" text,
	"logo_gcs_path" text,
	"website" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dossier_unlocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"property_id" uuid NOT NULL,
	"otp_verified_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"property_id" uuid NOT NULL,
	"unit_variant_id" uuid,
	"status" "enquiry_status" DEFAULT 'new' NOT NULL,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "layout_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"property_type_id" uuid NOT NULL,
	"developer_id" uuid NOT NULL,
	"rera_registration_number" text,
	"rera_registered" boolean DEFAULT false NOT NULL,
	"rera_last_verified_at" timestamp with time zone,
	"city" text NOT NULL,
	"locality" text NOT NULL,
	"latitude" numeric,
	"longitude" numeric,
	"pincode" text,
	"total_towers" integer,
	"total_units" integer,
	"possession_status" "possession_status",
	"possession_date" date,
	"launch_date" date,
	"rera_project_land_area_sqft" numeric,
	"rera_carpet_area_range_min_sqft" numeric,
	"rera_carpet_area_range_max_sqft" numeric,
	"rera_construction_progress_percent" numeric,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_amenities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"amenity_catalog_id" uuid NOT NULL,
	"status" "catalog_item_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"unit_variant_id" uuid,
	"media_type" "media_type" NOT NULL,
	"gcs_path" text NOT NULL,
	"caption" text,
	"display_order" integer NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_schema_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"field_key" text NOT NULL,
	"label" text NOT NULL,
	"data_type" text NOT NULL,
	"jsonb_path" text,
	"schema_version" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "property_schema_fields_field_key_unique" UNIQUE("field_key")
);
--> statement-breakpoint
CREATE TABLE "property_specifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"specification_catalog_id" uuid NOT NULL,
	"value_text" text,
	"status" "catalog_item_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_submission_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"field_key" text NOT NULL,
	"value" jsonb NOT NULL,
	"confidence" numeric,
	"source_document_id" uuid,
	"source_page" integer,
	"source_snippet" text,
	"review_status" "field_review_status" DEFAULT 'needs_review' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid,
	"submitted_by" text,
	"reviewed_by" text,
	"source" "submission_source" NOT NULL,
	"status" "submission_status" DEFAULT 'draft' NOT NULL,
	"payload" jsonb NOT NULL,
	"diff_summary" jsonb,
	"submitted_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rera_fetch_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid,
	"rera_registration_number" text NOT NULL,
	"status" "rera_fetch_job_status" DEFAULT 'queued' NOT NULL,
	"fetched_payload" jsonb,
	"matched_fields" jsonb,
	"run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"rating" smallint NOT NULL,
	"remarks" text,
	"verification_status" "review_verification_status" DEFAULT 'unverified' NOT NULL,
	"verification_document_id" uuid,
	"verified_by" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"property_id" uuid NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid,
	"document_type" "document_type" NOT NULL,
	"gcs_path" text NOT NULL,
	"uploaded_by" text,
	"page_count" integer,
	"ocr_status" "ocr_status" DEFAULT 'pending' NOT NULL,
	"ocr_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "specification_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"category" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "specification_synonyms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"specification_catalog_id" uuid NOT NULL,
	"synonym_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_variant_id" uuid NOT NULL,
	"basis" "area_basis" NOT NULL,
	"area_sqft" numeric NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"bhk_type_id" uuid,
	"layout_type_id" uuid,
	"variant_name" text NOT NULL,
	"total_units_of_variant" integer,
	"dimensions" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "private"."unit_price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_variant_id" uuid NOT NULL,
	"price_inr" numeric NOT NULL,
	"price_per_sqft" numeric,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"source" "private"."price_source" NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amenity_synonyms" ADD CONSTRAINT "amenity_synonyms_amenity_catalog_id_amenity_catalog_id_fk" FOREIGN KEY ("amenity_catalog_id") REFERENCES "public"."amenity_catalog"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_intake_sessions" ADD CONSTRAINT "buyer_intake_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_intake_sessions" ADD CONSTRAINT "buyer_intake_sessions_desired_bhk_type_id_bhk_types_id_fk" FOREIGN KEY ("desired_bhk_type_id") REFERENCES "public"."bhk_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_profiles" ADD CONSTRAINT "buyer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparison_items" ADD CONSTRAINT "comparison_items_comparison_id_comparisons_id_fk" FOREIGN KEY ("comparison_id") REFERENCES "public"."comparisons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparison_items" ADD CONSTRAINT "comparison_items_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparison_items" ADD CONSTRAINT "comparison_items_unit_variant_id_unit_variants_id_fk" FOREIGN KEY ("unit_variant_id") REFERENCES "public"."unit_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_users" ADD CONSTRAINT "developer_users_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_users" ADD CONSTRAINT "developer_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier_unlocks" ADD CONSTRAINT "dossier_unlocks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier_unlocks" ADD CONSTRAINT "dossier_unlocks_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_unit_variant_id_unit_variants_id_fk" FOREIGN KEY ("unit_variant_id") REFERENCES "public"."unit_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_property_type_id_property_types_id_fk" FOREIGN KEY ("property_type_id") REFERENCES "public"."property_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_amenities" ADD CONSTRAINT "property_amenities_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_amenities" ADD CONSTRAINT "property_amenities_amenity_catalog_id_amenity_catalog_id_fk" FOREIGN KEY ("amenity_catalog_id") REFERENCES "public"."amenity_catalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_media" ADD CONSTRAINT "property_media_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_media" ADD CONSTRAINT "property_media_unit_variant_id_unit_variants_id_fk" FOREIGN KEY ("unit_variant_id") REFERENCES "public"."unit_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_revisions" ADD CONSTRAINT "property_revisions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_revisions" ADD CONSTRAINT "property_revisions_submission_id_property_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."property_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_specifications" ADD CONSTRAINT "property_specifications_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_specifications" ADD CONSTRAINT "property_specifications_specification_catalog_id_specification_catalog_id_fk" FOREIGN KEY ("specification_catalog_id") REFERENCES "public"."specification_catalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_submission_fields" ADD CONSTRAINT "property_submission_fields_submission_id_property_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."property_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_submission_fields" ADD CONSTRAINT "property_submission_fields_field_key_property_schema_fields_field_key_fk" FOREIGN KEY ("field_key") REFERENCES "public"."property_schema_fields"("field_key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_submission_fields" ADD CONSTRAINT "property_submission_fields_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_submissions" ADD CONSTRAINT "property_submissions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_submissions" ADD CONSTRAINT "property_submissions_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_submissions" ADD CONSTRAINT "property_submissions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rera_fetch_jobs" ADD CONSTRAINT "rera_fetch_jobs_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_verification_document_id_source_documents_id_fk" FOREIGN KEY ("verification_document_id") REFERENCES "public"."source_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_properties" ADD CONSTRAINT "saved_properties_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_properties" ADD CONSTRAINT "saved_properties_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specification_synonyms" ADD CONSTRAINT "specification_synonyms_specification_catalog_id_specification_catalog_id_fk" FOREIGN KEY ("specification_catalog_id") REFERENCES "public"."specification_catalog"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_areas" ADD CONSTRAINT "unit_areas_unit_variant_id_unit_variants_id_fk" FOREIGN KEY ("unit_variant_id") REFERENCES "public"."unit_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_variants" ADD CONSTRAINT "unit_variants_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_variants" ADD CONSTRAINT "unit_variants_bhk_type_id_bhk_types_id_fk" FOREIGN KEY ("bhk_type_id") REFERENCES "public"."bhk_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_variants" ADD CONSTRAINT "unit_variants_layout_type_id_layout_types_id_fk" FOREIGN KEY ("layout_type_id") REFERENCES "public"."layout_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."unit_price_history" ADD CONSTRAINT "unit_price_history_unit_variant_id_unit_variants_id_fk" FOREIGN KEY ("unit_variant_id") REFERENCES "public"."unit_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."unit_price_history" ADD CONSTRAINT "unit_price_history_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_userId_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_userId_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_users_user_id_unique" ON "admin_users" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "amenity_catalog_key_unique" ON "amenity_catalog" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "amenity_synonyms_catalog_text_unique" ON "amenity_synonyms" USING btree ("amenity_catalog_id","synonym_text");--> statement-breakpoint
CREATE UNIQUE INDEX "bhk_types_key_unique" ON "bhk_types" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_buckets_display_order_unique" ON "budget_buckets" USING btree ("display_order");--> statement-breakpoint
CREATE INDEX "buyer_intake_sessions_user_id_idx" ON "buyer_intake_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "buyer_profiles_user_id_unique" ON "buyer_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "comparison_items_comparison_order_unique" ON "comparison_items" USING btree ("comparison_id","display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "developer_users_developer_user_unique" ON "developer_users" USING btree ("developer_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "developer_users_user_id_unique" ON "developer_users" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "developers_rera_developer_id_unique" ON "developers" USING btree ("rera_developer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dossier_unlocks_user_property_unique" ON "dossier_unlocks" USING btree ("user_id","property_id");--> statement-breakpoint
CREATE INDEX "enquiries_property_id_idx" ON "enquiries" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "layout_types_key_unique" ON "layout_types" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "properties_slug_unique" ON "properties" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "properties_rera_registration_number_unique" ON "properties" USING btree ("rera_registration_number");--> statement-breakpoint
CREATE INDEX "properties_developer_id_idx" ON "properties" USING btree ("developer_id");--> statement-breakpoint
CREATE INDEX "properties_location_idx" ON "properties" USING btree ("city","locality");--> statement-breakpoint
CREATE UNIQUE INDEX "property_amenities_property_catalog_unique" ON "property_amenities" USING btree ("property_id","amenity_catalog_id");--> statement-breakpoint
CREATE INDEX "property_media_property_order_idx" ON "property_media" USING btree ("property_id","display_order");--> statement-breakpoint
CREATE INDEX "property_revisions_property_id_idx" ON "property_revisions" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "property_specifications_property_catalog_unique" ON "property_specifications" USING btree ("property_id","specification_catalog_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submission_fields_submission_field_key_unique" ON "property_submission_fields" USING btree ("submission_id","field_key");--> statement-breakpoint
CREATE INDEX "property_submissions_status_idx" ON "property_submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "property_submissions_property_id_idx" ON "property_submissions" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "property_types_key_unique" ON "property_types" USING btree ("key");--> statement-breakpoint
CREATE INDEX "rera_fetch_jobs_property_id_idx" ON "rera_fetch_jobs" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "reviews_property_id_idx" ON "reviews" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "reviews_user_id_idx" ON "reviews" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_properties_user_property_unique" ON "saved_properties" USING btree ("user_id","property_id");--> statement-breakpoint
CREATE INDEX "source_documents_property_id_idx" ON "source_documents" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "specification_catalog_key_unique" ON "specification_catalog" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "specification_synonyms_catalog_text_unique" ON "specification_synonyms" USING btree ("specification_catalog_id","synonym_text");--> statement-breakpoint
CREATE UNIQUE INDEX "unit_areas_variant_basis_unique" ON "unit_areas" USING btree ("unit_variant_id","basis");--> statement-breakpoint
CREATE INDEX "unit_variants_property_id_idx" ON "unit_variants" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unit_variants_property_variant_name_unique" ON "unit_variants" USING btree ("property_id","variant_name");
--> statement-breakpoint
-- Exact prices are deny-by-default: the normal application role does not have
-- private-schema access, while the future matching service uses the explicitly
-- provisioned BYPASSRLS role. The owner is forced through RLS as well.
ALTER TABLE "private"."unit_price_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "private"."unit_price_history" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "unit_price_history_one_current_price_per_variant_unique" ON "private"."unit_price_history" USING btree ("unit_variant_id") WHERE "effective_to" IS NULL;--> statement-breakpoint
CREATE VIEW "private"."unit_current_bucket" WITH (security_invoker = true) AS
SELECT uv.id AS unit_variant_id, bb.id AS budget_bucket_id
FROM public.unit_variants AS uv
JOIN private.unit_price_history AS ph
  ON ph.unit_variant_id = uv.id AND ph.effective_to IS NULL
JOIN public.budget_buckets AS bb
  ON ph.price_inr BETWEEN bb.min_inr AND bb.max_inr;--> statement-breakpoint
REVOKE ALL ON SCHEMA private FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON SCHEMA private FROM propcompare_app;--> statement-breakpoint
GRANT USAGE ON SCHEMA private TO propcompare_service;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "private"."unit_price_history" TO propcompare_service;--> statement-breakpoint
GRANT SELECT ON TABLE "private"."unit_current_bucket" TO propcompare_service;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO propcompare_app, propcompare_service;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO propcompare_app;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO propcompare_app;
