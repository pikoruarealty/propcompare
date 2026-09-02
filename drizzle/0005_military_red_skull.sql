ALTER TABLE "developers" ADD COLUMN "profile_narrative" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "total_floors" integer;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "plot_area_sqft" numeric;--> statement-breakpoint
ALTER TABLE "unit_variants" ADD COLUMN "units_per_floor" integer;