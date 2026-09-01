import {
  boolean,
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
export const ocrStatus = pgEnum("ocr_status", [
  "pending",
  "processing",
  "completed",
  "failed",
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
export const reraFetchJobStatus = pgEnum("rera_fetch_job_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
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

export const budgetBuckets = pgTable(
  "budget_buckets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    label: text("label").notNull(),
    minInr: numeric("min_inr").notNull(),
    maxInr: numeric("max_inr").notNull(),
    displayOrder: integer("display_order").notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("budget_buckets_display_order_unique").on(table.displayOrder),
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
    reraRegistrationNumber: text("rera_registration_number"),
    reraRegistered: boolean("rera_registered").default(false).notNull(),
    reraLastVerifiedAt: timestamp("rera_last_verified_at", {
      withTimezone: true,
    }),
    city: text("city").notNull(),
    locality: text("locality").notNull(),
    latitude: numeric("latitude"),
    longitude: numeric("longitude"),
    pincode: text("pincode"),
    totalTowers: integer("total_towers"),
    totalUnits: integer("total_units"),
    possessionStatus: possessionStatus("possession_status"),
    possessionDate: date("possession_date"),
    launchDate: date("launch_date"),
    reraProjectLandAreaSqft: numeric("rera_project_land_area_sqft"),
    reraCarpetAreaRangeMinSqft: numeric("rera_carpet_area_range_min_sqft"),
    reraCarpetAreaRangeMaxSqft: numeric("rera_carpet_area_range_max_sqft"),
    reraConstructionProgressPercent: numeric(
      "rera_construction_progress_percent",
    ),
    description: text("description"),
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
    dimensions: jsonb("dimensions"),
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
    displayOrder: integer("display_order").notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    ...timestamps(),
  },
  (table) => [
    index("property_media_property_order_idx").on(
      table.propertyId,
      table.displayOrder,
    ),
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
    ocrStatus: ocrStatus("ocr_status").default("pending").notNull(),
    ocrCompletedAt: timestamp("ocr_completed_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [index("source_documents_property_id_idx").on(table.propertyId)],
);

export const propertySubmissions = pgTable(
  "property_submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    propertyId: uuid("property_id").references(() => properties.id, {
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
    sourceDocumentId: uuid("source_document_id").references(
      () => sourceDocuments.id,
      { onDelete: "set null" },
    ),
    sourcePage: integer("source_page"),
    sourceSnippet: text("source_snippet"),
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
    fetchedPayload: jsonb("fetched_payload"),
    matchedFields: jsonb("matched_fields"),
    runAt: timestamp("run_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [index("rera_fetch_jobs_property_id_idx").on(table.propertyId)],
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
    city: text("city").notNull(),
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
  propertySpecifications,
  propertyMedia,
] as const;
