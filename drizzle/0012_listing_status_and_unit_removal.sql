CREATE TYPE "public"."listing_status" AS ENUM('listed', 'unlisted', 'deleted');--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "listing_status" "listing_status" DEFAULT 'listed' NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "listing_status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "unit_variants" ADD COLUMN "removed_at" timestamp with time zone;