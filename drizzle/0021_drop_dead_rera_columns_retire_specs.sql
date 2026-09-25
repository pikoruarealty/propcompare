ALTER TABLE "properties" DROP COLUMN "rera_last_verified_at";--> statement-breakpoint
ALTER TABLE "properties" DROP COLUMN "rera_carpet_area_range_min_sqft";--> statement-breakpoint
ALTER TABLE "properties" DROP COLUMN "rera_carpet_area_range_max_sqft";--> statement-breakpoint
-- Two specifications the regulator now covers as stated numbers (open area, and density from land area and units); deactivated, not deleted, so a property that ever held one keeps it and this is reversible.
UPDATE "property_schema_fields" SET "is_active" = false, "updated_at" = now() WHERE "field_key" IN ('property.specifications.open_space', 'property.specifications.density_units_per_acre');
