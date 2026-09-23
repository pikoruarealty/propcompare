CREATE TABLE "unit_variant_amenities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_variant_id" uuid NOT NULL,
	"amenity_catalog_id" uuid NOT NULL,
	"status" "catalog_item_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "unit_variant_amenities" ADD CONSTRAINT "unit_variant_amenities_unit_variant_id_unit_variants_id_fk" FOREIGN KEY ("unit_variant_id") REFERENCES "public"."unit_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_variant_amenities" ADD CONSTRAINT "unit_variant_amenities_amenity_catalog_id_amenity_catalog_id_fk" FOREIGN KEY ("amenity_catalog_id") REFERENCES "public"."amenity_catalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unit_variant_amenities_variant_catalog_unique" ON "unit_variant_amenities" USING btree ("unit_variant_id","amenity_catalog_id");