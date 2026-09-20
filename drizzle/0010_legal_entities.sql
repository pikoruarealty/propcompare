CREATE TYPE "public"."legal_entity_type" AS ENUM('company', 'llp', 'partnership', 'proprietorship', 'trust', 'other');--> statement-breakpoint
CREATE TABLE "developer_legal_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"developer_id" uuid NOT NULL,
	"legal_name" text NOT NULL,
	"entity_type" "legal_entity_type" NOT NULL,
	"rera_promoter_registration_number" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "developer_legal_entities" ADD CONSTRAINT "developer_legal_entities_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "developer_legal_entities_developer_name_unique" ON "developer_legal_entities" USING btree ("developer_id", lower("legal_name"));--> statement-breakpoint
CREATE UNIQUE INDEX "developer_legal_entities_rera_promoter_unique" ON "developer_legal_entities" USING btree ("rera_promoter_registration_number") WHERE "developer_legal_entities"."rera_promoter_registration_number" is not null;--> statement-breakpoint
CREATE INDEX "developer_legal_entities_developer_id_idx" ON "developer_legal_entities" USING btree ("developer_id");--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "legal_entity_id" uuid;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_legal_entity_id_developer_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."developer_legal_entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Same scoped application-role grant as the other tables added after migration 0000.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.developer_legal_entities TO propcompare_app;
