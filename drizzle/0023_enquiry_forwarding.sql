ALTER TYPE "public"."enquiry_status" ADD VALUE 'forwarded';--> statement-breakpoint
ALTER TABLE "enquiries" ADD COLUMN "forwarded_at" timestamp with time zone;