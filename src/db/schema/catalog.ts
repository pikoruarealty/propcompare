import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth";

const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const possessionStatus = pgEnum("possession_status", [
  "under_construction",
  "ready_to_move",
  "nearing_possession",
]);
export const documentType = pgEnum("document_type", [
  "brochure_pdf",
  "rera_extract",
  "floor_plan",
  "possession_proof",
  "other",
]);
export const ocrJobStatus = pgEnum("ocr_job_status", [
  "draft",
  "queued",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);
export const submissionStatus = pgEnum("submission_status", [
  "draft",
  "submitted",
  "in_review",
  "changes_requested",
  "approved",
  "rejected",
  "published",
]);
export const fieldReviewStatus = pgEnum("field_review_status", [
  "auto_accepted",
  "needs_review",
  "confirmed",
  "edited",
  "rejected",
]);
export const areaBasis = pgEnum("area_basis", [
  "carpet",
  "super_built_up",
  "built_up",
]);
export const catalogItemStatus = pgEnum("catalog_item_status", [
  "available",
  "not_stated",
  "explicitly_not_offered",
]);
export const submissionSource = pgEnum("submission_source", [
  "manual_form",
  "ocr_brochure",
  "rera_scrape",
]);
export const reviewVerificationStatus = pgEnum("review_verification_status", [
  "unverified",
  "verified",
]);
export const mediaType = pgEnum("media_type", [
  "photo",
  "floor_plan",
  "video",
  "brochure_pdf",
]);
export const mediaSourceKind = pgEnum("media_source_kind", [
  "developer_brochure",
  "own",
  "developer_supplied",
]);
export const reraFetchJobStatus = pgEnum("rera_fetch_job_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
]);
/** Whether buyers can see a property (schema v8). Soft only: nothing is deleted. */
export const listingStatus = pgEnum("listing_status", [
  "listed",
  "unlisted",
  "deleted",
]);
export const developerUserStatus = pgEnum("developer_user_status", [
  "active",
  "invited",
  "revoked",
]);
export const adminPermissionLevel = pgEnum("admin_permission_level", [
  "verifier",
  "owner",
]);
export const enquiryStatus = pgEnum("enquiry_status", [
  "new",
  "contacted",
  "closed",
  // An admin sent it on to the developer (schema v19). Enquiries reach the admin
  // first; forwarding is the admin's choice, and so is closing it themselves.
  "forwarded",
]);

export const propertyTypes = pgTable(
  "property_types",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    ...timestamps(),
  },
  (table) => [uniqueIndex("property_types_key_unique").on(table.key)],
);

export const bhkTypes = pgTable(
  "bhk_types",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    bedroomCount: integer("bedroom_count"),
    ...timestamps(),
  },
  (table) => [uniqueIndex("bhk_types_key_unique").on(table.key)],
);

export const layoutTypes = pgTable(
  "layout_types",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    ...timestamps(),
  },
  (table) => [uniqueIndex("layout_types_key_unique").on(table.key)],
);

export const amenityCatalog = pgTable(
  "amenity_catalog",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    category: text("category").notNull(),
    ...timestamps(),
  },
  (table) => [uniqueIndex("amenity_catalog_key_unique").on(table.key)],
);

export const amenitySynonyms = pgTable(
  "amenity_synonyms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    amenityCatalogId: uuid("amenity_catalog_id")
      .notNull()
      .references(() => amenityCatalog.id, { onDelete: "cascade" }),
    synonymText: text("synonym_text").notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("amenity_synonyms_catalog_text_unique").on(
      table.amenityCatalogId,
      table.synonymText,
    ),
  ],
);

export const specificationCatalog = pgTable(
  "specification_catalog",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    category: text("category").notNull(),
    ...timestamps(),
  },
  (table) => [uniqueIndex("specification_catalog_key_unique").on(table.key)],
);

export const specificationSynonyms = pgTable(
  "specification_synonyms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    specificationCatalogId: uuid("specification_catalog_id")
      .notNull()
      .references(() => specificationCatalog.id, { onDelete: "cascade" }),
    synonymText: text("synonym_text").notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("specification_synonyms_catalog_text_unique").on(
      table.specificationCatalogId,
      table.synonymText,
    ),
  ],
);

export const propertySchemaFields = pgTable("property_schema_fields", {
  id: uuid("id").defaultRandom().primaryKey(),
  fieldKey: text("field_key").notNull().unique(),
  label: text("label").notNull(),
  dataType: text("data_type").notNull(),
  jsonbPath: text("jsonb_path"),
  schemaVersion: text("schema_version").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  description: text("description").notNull(),
  ...timestamps(),
});

export const developers = pgTable(
  "developers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    reraDeveloperId: text("rera_developer_id"),
    description: text("description"),
    profileNarrative: text("profile_narrative"),
    logoGcsPath: text("logo_gcs_path"),
    website: text("website"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("developers_rera_developer_id_unique").on(
      table.reraDeveloperId,
    ),
  ],
);

export const legalEntityType = pgEnum("legal_entity_type", [
  "company",
  "llp",
  "partnership",
  "proprietorship",
  "trust",
  "other",
]);

/**
 * The legal promoter entities RERA registers projects under, attached to the
 * buyer-facing developer profile (schema v6, section 3). A profile is the brand
 * ("Adani"); an entity is the company on the registration ("Adani Realty Ltd").
 */
export const developerLegalEntities = pgTable(
  "developer_legal_entities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    developerId: uuid("developer_id")
      .notNull()
      .references(() => developers.id, { onDelete: "cascade" }),
    legalName: text("legal_name").notNull(),
    entityType: legalEntityType("entity_type").notNull(),
    /** The GujRERA promoter registration number, when known. */
    reraPromoterRegistrationNumber: text("rera_promoter_registration_number"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("developer_legal_entities_developer_name_unique").on(
      table.developerId,
      sql`lower(${table.legalName})`,
    ),
    uniqueIndex("developer_legal_entities_rera_promoter_unique")
      .on(table.reraPromoterRegistrationNumber)
      .where(sql`${table.reraPromoterRegistrationNumber} is not null`),
    index("developer_legal_entities_developer_id_idx").on(table.developerId),
  ],
);

export const properties = pgTable(
  "properties",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    propertyTypeId: uuid("property_type_id")
      .notNull()
      .references(() => propertyTypes.id),
    developerId: uuid("developer_id")
      .notNull()
      .references(() => developers.id),
    legalEntityId: uuid("legal_entity_id").references(
      () => developerLegalEntities.id,
      { onDelete: "restrict" },
    ),
    reraRegistrationNumber: text("rera_registration_number"),
    reraRegistered: boolean("rera_registered").default(false).notNull(),
    city: text("city").notNull(),
    locality: text("locality").notNull(),
    latitude: numeric("latitude"),
    longitude: numeric("longitude"),
    pincode: text("pincode"),
    /** The Google Maps link an admin sets for the project (schema v15). */
    mapUrl: text("map_url"),
    totalTowers: integer("total_towers"),
    totalFloors: integer("total_floors"),
    totalUnits: integer("total_units"),
    plotAreaSqft: numeric("plot_area_sqft"),
    possessionStatus: possessionStatus("possession_status"),
    possessionDate: date("possession_date"),
    launchDate: date("launch_date"),
    reraProjectLandAreaSqft: numeric("rera_project_land_area_sqft"),
    reraConstructionProgressPercent: numeric(
      "rera_construction_progress_percent",
    ),
    /** The regulator's latest project facts that no other source states (open and
     * covered area, units available as on a date, lifts, filing record, the team,
     * per-carpet-area availability), as one versioned object (schema v17). Money
     * and contact details never enter it. Written only by the publish transaction
     * from `property.rera_snapshot`. */
    reraSnapshot: jsonb("rera_snapshot"),
    description: text("description"),
    /** Buyers see only `listed` properties. `unlisted` is reversible and hidden;
     * `deleted` is a soft delete (also hidden, restorable by an owner). Changed
     * only by the publish transaction (schema v8). */
    listingStatus: listingStatus("listing_status").default("listed").notNull(),
    listingStatusChangedAt: timestamp("listing_status_changed_at", {
      withTimezone: true,
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("properties_slug_unique").on(table.slug),
    uniqueIndex("properties_rera_registration_number_unique").on(
      table.reraRegistrationNumber,
    ),
    index("properties_developer_id_idx").on(table.developerId),
    index("properties_location_idx").on(table.city, table.locality),
  ],
);

export const unitVariants = pgTable(
  "unit_variants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    bhkTypeId: uuid("bhk_type_id").references(() => bhkTypes.id),
    layoutTypeId: uuid("layout_type_id").references(() => layoutTypes.id),
    variantName: text("variant_name").notNull(),
    totalUnitsOfVariant: integer("total_units_of_variant"),
    unitsPerFloor: integer("units_per_floor"),
    dimensions: jsonb("dimensions"),
    /** Set when an admin removes the unit type. It is hidden from buyers but the
     * row stays (price history and saved comparisons point at it); a later edit
     * that lists the type again clears it (schema v8). */
    removedAt: timestamp("removed_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index("unit_variants_property_id_idx").on(table.propertyId),
    uniqueIndex("unit_variants_property_variant_name_unique").on(
      table.propertyId,
      table.variantName,
    ),
  ],
);

export const unitAreas = pgTable(
  "unit_areas",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    unitVariantId: uuid("unit_variant_id")
      .notNull()
      .references(() => unitVariants.id, { onDelete: "cascade" }),
    basis: areaBasis("basis").notNull(),
    areaSqft: numeric("area_sqft").notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("unit_areas_variant_basis_unique").on(
      table.unitVariantId,
      table.basis,
    ),
  ],
);

export const propertyAmenities = pgTable(
  "property_amenities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    amenityCatalogId: uuid("amenity_catalog_id")
      .notNull()
      .references(() => amenityCatalog.id),
    status: catalogItemStatus("status").notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("property_amenities_property_catalog_unique").on(
      table.propertyId,
      table.amenityCatalogId,
    ),
  ],
);

/**
 * A unit type's own amenities — distinct from `propertyAmenities`, which
 * describes the whole property. A penthouse's private pool belongs here, not
 * on the property (which would wrongly say every unit has one). Schema v11,
 * `docs/schema/schema.v11.md`; owner-approved 2026-09-22, `DECISIONS.md`.
 */
export const unitVariantAmenities = pgTable(
  "unit_variant_amenities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    unitVariantId: uuid("unit_variant_id")
      .notNull()
      .references(() => unitVariants.id, { onDelete: "cascade" }),
    amenityCatalogId: uuid("amenity_catalog_id")
      .notNull()
      .references(() => amenityCatalog.id),
    status: catalogItemStatus("status").notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("unit_variant_amenities_variant_catalog_unique").on(
      table.unitVariantId,
      table.amenityCatalogId,
    ),
  ],
);

export const propertySpecifications = pgTable(
  "property_specifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    specificationCatalogId: uuid("specification_catalog_id")
      .notNull()
      .references(() => specificationCatalog.id),
    valueText: text("value_text"),
    status: catalogItemStatus("status").notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("property_specifications_property_catalog_unique").on(
      table.propertyId,
      table.specificationCatalogId,
    ),
  ],
);

export const propertyMedia = pgTable(
  "property_media",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    unitVariantId: uuid("unit_variant_id").references(() => unitVariants.id, {
      onDelete: "set null",
    }),
    mediaType: mediaType("media_type").notNull(),
    gcsPath: text("gcs_path").notNull(),
    caption: text("caption"),
    attribution: text("attribution"),
    sourceKind: mediaSourceKind("source_kind"),
    displayOrder: integer("display_order").notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    /** Set when an edit takes the picture off the listing (schema v9). Soft: the row
     * stays, buyers no longer see it. */
    removedAt: timestamp("removed_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index("property_media_property_order_idx").on(
      table.propertyId,
      table.displayOrder,
    ),
    // At most one main photo per property (schema v14). The publisher clears the
    // previous one in the same transaction it sets the next.
    uniqueIndex("property_media_one_primary_idx")
      .on(table.propertyId)
      .where(sql`${table.isPrimary} and ${table.removedAt} is null`),
  ],
);

export const sourceDocuments = pgTable(
  "source_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    propertyId: uuid("property_id").references(() => properties.id, {
      onDelete: "set null",
    }),
    documentType: documentType("document_type").notNull(),
    gcsPath: text("gcs_path").notNull(),
    uploadedBy: text("uploaded_by").references(() => users.id, {
      onDelete: "set null",
    }),
    pageCount: integer("page_count"),
    ...timestamps(),
  },
  (table) => [
    index("source_documents_property_id_idx").on(table.propertyId),
    check(
      "source_documents_page_count_positive",
      sql`${table.pageCount} is null or ${table.pageCount} > 0`,
    ),
  ],
);

export const propertySubmissions = pgTable(
  "property_submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    propertyId: uuid("property_id").references(() => properties.id, {
      onDelete: "set null",
    }),
    developerId: uuid("developer_id").references(() => developers.id, {
      onDelete: "set null",
    }),
    submittedBy: text("submitted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedBy: text("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    source: submissionSource("source").notNull(),
    status: submissionStatus("status").default("draft").notNull(),
    payload: jsonb("payload").notNull(),
    diffSummary: jsonb("diff_summary"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /** Set when an owner clears a published submission out of the admin queue
     * (schema v13). Only ever set on a published one: anything never published is
     * deleted outright. The record and its live listing are untouched. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index("property_submissions_status_idx").on(table.status),
    index("property_submissions_property_id_idx").on(table.propertyId),
  ],
);

export const propertySubmissionFields = pgTable(
  "property_submission_fields",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => propertySubmissions.id, { onDelete: "cascade" }),
    fieldKey: text("field_key")
      .notNull()
      .references(() => propertySchemaFields.fieldKey),
    value: jsonb("value").notNull(),
    confidence: numeric("confidence"),
    reviewStatus: fieldReviewStatus("review_status")
      .default("needs_review")
      .notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("submission_fields_submission_field_key_unique").on(
      table.submissionId,
      table.fieldKey,
    ),
  ],
);

/**
 * Pre-publication media. A new property's live unit variants do not exist
 * until publish, so an optional target is kept as the canonical variant name
 * and resolved in `publishSubmission`; a missing match aborts rather than
 * attaching a floor plan speculatively.
 */
export const propertySubmissionMedia = pgTable(
  "property_submission_media",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => propertySubmissions.id, { onDelete: "cascade" }),
    sourceDocumentId: uuid("source_document_id").references(
      () => sourceDocuments.id,
      { onDelete: "set null" },
    ),
    uploadedBy: text("uploaded_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedBy: text("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    unitVariantName: text("unit_variant_name"),
    mediaType: mediaType("media_type").notNull(),
    sourceKind: mediaSourceKind("source_kind").notNull(),
    gcsPath: text("gcs_path").notNull(),
    caption: text("caption"),
    attribution: text("attribution").notNull(),
    displayOrder: integer("display_order").notNull(),
    isPublic: boolean("is_public").default(false).notNull(),
    reviewStatus: fieldReviewStatus("review_status")
      .default("needs_review")
      .notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("property_submission_media_submission_order_unique").on(
      table.submissionId,
      table.displayOrder,
    ),
    index("property_submission_media_submission_id_idx").on(table.submissionId),
    check(
      "property_submission_media_display_order_non_negative",
      sql`${table.displayOrder} >= 0`,
    ),
  ],
);

export const ocrExtractionJobs = pgTable(
  "ocr_extraction_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceDocumentId: uuid("source_document_id")
      .notNull()
      .references(() => sourceDocuments.id, { onDelete: "cascade" }),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => propertySubmissions.id, { onDelete: "cascade" }),
    status: ocrJobStatus("status").default("draft").notNull(),
    pipelineVersion: text("pipeline_version").notNull(),
    fieldSchemaVersion: text("field_schema_version").notNull(),
    providerKey: text("provider_key"),
    providerJobId: text("provider_job_id"),
    routingManifest: jsonb("routing_manifest").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    ...timestamps(),
  },
  (table) => [
    index("ocr_extraction_jobs_document_id_idx").on(table.sourceDocumentId),
    index("ocr_extraction_jobs_submission_id_idx").on(table.submissionId),
    index("ocr_extraction_jobs_status_idx").on(table.status),
    uniqueIndex("ocr_extraction_jobs_provider_job_unique").on(
      table.providerKey,
      table.providerJobId,
    ),
  ],
);

export const propertySubmissionFieldEvidence = pgTable(
  "property_submission_field_evidence",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    submissionFieldId: uuid("submission_field_id")
      .notNull()
      .references(() => propertySubmissionFields.id, { onDelete: "cascade" }),
    ocrExtractionJobId: uuid("ocr_extraction_job_id").references(
      () => ocrExtractionJobs.id,
      { onDelete: "set null" },
    ),
    sourceDocumentId: uuid("source_document_id")
      .notNull()
      .references(() => sourceDocuments.id),
    sourcePage: integer("source_page").notNull(),
    valuePath: text("value_path").default("$").notNull(),
    sourceSnippet: text("source_snippet"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("submission_field_evidence_source_unique").on(
      table.submissionFieldId,
      table.sourceDocumentId,
      table.sourcePage,
      table.valuePath,
    ),
    index("submission_field_evidence_job_id_idx").on(table.ocrExtractionJobId),
    check(
      "submission_field_evidence_source_page_positive",
      sql`${table.sourcePage} > 0`,
    ),
  ],
);

export const propertyRevisions = pgTable(
  "property_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => propertySubmissions.id),
    snapshot: jsonb("snapshot").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (table) => [index("property_revisions_property_id_idx").on(table.propertyId)],
);

export const reraFetchJobs = pgTable(
  "rera_fetch_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    propertyId: uuid("property_id").references(() => properties.id, {
      onDelete: "set null",
    }),
    reraRegistrationNumber: text("rera_registration_number").notNull(),
    status: reraFetchJobStatus("status").default("queued").notNull(),
    /** The normalized regulator record plus which pieces were missing. Never a raw
     * response: those carry prices, which must not enter this database. */
    fetchedPayload: jsonb("fetched_payload"),
    matchedFields: jsonb("matched_fields"),
    runAt: timestamp("run_at", { withTimezone: true }),
    /** Which regulator adapter answered (schema v7). */
    regulatorCode: text("regulator_code").default("gujrera").notNull(),
    /** The regulator's own id for the project, opaque to us (schema v7). */
    externalProjectId: text("external_project_id"),
    /** The submission a fetch was run for, when it was run during review. */
    submissionId: uuid("submission_id").references(
      () => propertySubmissions.id,
      {
        onDelete: "set null",
      },
    ),
    requestedBy: text("requested_by").references(() => users.id, {
      onDelete: "set null",
    }),
    /** A plain-words reason a fetch failed. */
    error: text("error"),
    ...timestamps(),
  },
  (table) => [
    index("rera_fetch_jobs_property_id_idx").on(table.propertyId),
    index("rera_fetch_jobs_submission_id_idx").on(table.submissionId),
  ],
);

export const buyerProfiles = pgTable(
  "buyer_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [uniqueIndex("buyer_profiles_user_id_unique").on(table.userId)],
);

export const developerUsers = pgTable(
  "developer_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    developerId: uuid("developer_id")
      .notNull()
      .references(() => developers.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title"),
    status: developerUserStatus("status").default("invited").notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("developer_users_developer_user_unique").on(
      table.developerId,
      table.userId,
    ),
    uniqueIndex("developer_users_user_id_unique").on(table.userId),
  ],
);

export const adminUsers = pgTable(
  "admin_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permissionLevel: adminPermissionLevel("permission_level").notNull(),
    mfaEnforced: boolean("mfa_enforced").default(false).notNull(),
    ...timestamps(),
  },
  (table) => [uniqueIndex("admin_users_user_id_unique").on(table.userId)],
);

export const buyerIntakeSessions = pgTable(
  "buyer_intake_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    personaPriorities: jsonb("persona_priorities").notNull(),
    desiredBhkTypeId: uuid("desired_bhk_type_id").references(() => bhkTypes.id),
    budgetMinInr: numeric("budget_min_inr"),
    budgetMaxInr: numeric("budget_max_inr"),
    // Nullable (schema v10): the intake city question is optional ("No
    // preference"), and a buyer can state a range or configuration without
    // ever answering it. See docs/schema/schema.v10.md.
    city: text("city"),
    ...timestamps(),
  },
  (table) => [index("buyer_intake_sessions_user_id_idx").on(table.userId)],
);

export const savedProperties = pgTable(
  "saved_properties",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    savedAt: timestamp("saved_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("saved_properties_user_property_unique").on(
      table.userId,
      table.propertyId,
    ),
  ],
);

export const comparisons = pgTable("comparisons", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  ...timestamps(),
});

export const comparisonItems = pgTable(
  "comparison_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    comparisonId: uuid("comparison_id")
      .notNull()
      .references(() => comparisons.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    unitVariantId: uuid("unit_variant_id").references(() => unitVariants.id, {
      onDelete: "set null",
    }),
    displayOrder: integer("display_order").notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("comparison_items_comparison_order_unique").on(
      table.comparisonId,
      table.displayOrder,
    ),
  ],
);

export const enquiries = pgTable(
  "enquiries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    unitVariantId: uuid("unit_variant_id").references(() => unitVariants.id, {
      onDelete: "set null",
    }),
    status: enquiryStatus("status").default("new").notNull(),
    message: text("message"),
    /** When an admin last forwarded it to the developer (schema v19). */
    forwardedAt: timestamp("forwarded_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [index("enquiries_property_id_idx").on(table.propertyId)],
);

export const dossierUnlocks = pgTable(
  "dossier_unlocks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    otpVerifiedAt: timestamp("otp_verified_at", {
      withTimezone: true,
    }).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("dossier_unlocks_user_property_unique").on(
      table.userId,
      table.propertyId,
    ),
  ],
);

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rating: smallint("rating").notNull(),
    remarks: text("remarks"),
    verificationStatus: reviewVerificationStatus("verification_status")
      .default("unverified")
      .notNull(),
    verificationDocumentId: uuid("verification_document_id").references(
      () => sourceDocuments.id,
      { onDelete: "set null" },
    ),
    verifiedBy: text("verified_by").references(() => users.id, {
      onDelete: "set null",
    }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index("reviews_property_id_idx").on(table.propertyId),
    index("reviews_user_id_idx").on(table.userId),
  ],
);

export const liveCatalogTables = [
  properties,
  unitVariants,
  unitAreas,
  propertyAmenities,
  unitVariantAmenities,
  propertySpecifications,
  propertyMedia,
] as const;
