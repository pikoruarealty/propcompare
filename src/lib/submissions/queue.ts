import { getReraState, type ReraState } from "@/lib/rera/submission-fetch";
import { loadLiveValues } from "./live-values";
import { and, desc, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  amenityCatalog,
  bhkTypes,
  developerLegalEntities,
  developers,
  layoutTypes,
  ocrExtractionJobs,
  properties,
  propertySchemaFields,
  propertySubmissionFieldEvidence,
  propertySubmissionFields,
  propertySubmissionMedia,
  propertySubmissions,
  propertyTypes,
  type submissionStatus,
} from "@/db/schema/catalog";
import { describeExtractionFailure } from "@/lib/ingestion/extraction-status";

/**
 * Read model for the admin submission queue and detail screens. Read-only: it
 * changes no submission and no live catalog table. State changes go through
 * `applySubmissionTransition` and `publishSubmission`.
 *
 * A draft has no property row yet, so the display name and location are taken
 * from, in order: the linked live property, then the submission's own
 * `property.name` / `property.city` / `property.locality` field candidates.
 * Missing values stay `null` (rendered "Not stated"), never guessed.
 */

export type SubmissionStatus = (typeof submissionStatus.enumValues)[number];

export const SUBMISSION_STATUS_LABEL: Record<SubmissionStatus, string> = {
  draft: "Draft",
  submitted: "New",
  in_review: "Under review",
  changes_requested: "Changes requested",
  approved: "Approved",
  rejected: "Rejected",
  published: "Published",
};

export const isSubmissionStatus = (
  value: string | undefined,
): value is SubmissionStatus =>
  value !== undefined && value in SUBMISSION_STATUS_LABEL;

export interface SubmissionQueueItem {
  id: string;
  status: SubmissionStatus;
  source: "manual_form" | "ocr_brochure" | "rera_scrape";
  developerName: string | null;
  propertyName: string | null;
  city: string | null;
  locality: string | null;
  fieldCount: number;
  needsReviewCount: number;
  submittedAt: Date | null;
  createdAt: Date;
}

const fieldText = (key: string) =>
  sql<
    string | null
  >`(select f.value #>> '{}' from ${propertySubmissionFields} f where f.submission_id = ${propertySubmissions.id} and f.field_key = ${key})`;

export const listSubmissionQueue = async (
  database: PostgresJsDatabase,
  filter: { status?: SubmissionStatus; id?: string } = {},
): Promise<SubmissionQueueItem[]> => {
  const rows = await database
    .select({
      id: propertySubmissions.id,
      status: propertySubmissions.status,
      source: propertySubmissions.source,
      developerName: developers.name,
      propertyName: sql<
        string | null
      >`coalesce(${properties.name}, ${fieldText("property.name")})`,
      city: sql<
        string | null
      >`coalesce(${properties.city}, ${fieldText("property.city")})`,
      locality: sql<
        string | null
      >`coalesce(${properties.locality}, ${fieldText("property.locality")})`,
      fieldCount: sql<number>`(select count(*)::int from ${propertySubmissionFields} f where f.submission_id = ${propertySubmissions.id})`,
      needsReviewCount: sql<number>`(select count(*)::int from ${propertySubmissionFields} f where f.submission_id = ${propertySubmissions.id} and f.review_status = 'needs_review')`,
      submittedAt: propertySubmissions.submittedAt,
      createdAt: propertySubmissions.createdAt,
    })
    .from(propertySubmissions)
    .leftJoin(developers, eq(developers.id, propertySubmissions.developerId))
    .leftJoin(properties, eq(properties.id, propertySubmissions.propertyId))
    .where(
      and(
        filter.status
          ? eq(propertySubmissions.status, filter.status)
          : undefined,
        filter.id ? eq(propertySubmissions.id, filter.id) : undefined,
      ),
    )
    .orderBy(desc(propertySubmissions.createdAt));
  return rows;
};

/** Controlled vocabularies the typed field inputs offer. Keys are what is stored. */
export interface SubmissionLookups {
  propertyTypes: { key: string; label: string }[];
  amenities: { key: string; label: string; category: string }[];
  bhkTypes: { key: string; label: string }[];
  layoutTypes: { key: string; label: string }[];
  /** The submission's developer's recorded legal entities. */
  legalEntities: { id: string; label: string }[];
}

export const getSubmissionLookups = async (
  database: PostgresJsDatabase,
  developerId: string | null = null,
): Promise<SubmissionLookups> => {
  const [types, amenities, bhk, layouts, entities] = await Promise.all([
    database
      .select({ key: propertyTypes.key, label: propertyTypes.label })
      .from(propertyTypes)
      .orderBy(propertyTypes.label),
    database
      .select({
        key: amenityCatalog.key,
        label: amenityCatalog.label,
        category: amenityCatalog.category,
      })
      .from(amenityCatalog)
      .orderBy(amenityCatalog.category, amenityCatalog.label),
    database
      .select({ key: bhkTypes.key, label: bhkTypes.label })
      .from(bhkTypes)
      .orderBy(bhkTypes.bedroomCount),
    database
      .select({ key: layoutTypes.key, label: layoutTypes.label })
      .from(layoutTypes)
      .orderBy(layoutTypes.label),
    developerId === null
      ? Promise.resolve([])
      : database
          .select({
            id: developerLegalEntities.id,
            legalName: developerLegalEntities.legalName,
          })
          .from(developerLegalEntities)
          .where(eq(developerLegalEntities.developerId, developerId))
          .orderBy(developerLegalEntities.legalName),
  ]);
  return {
    propertyTypes: types,
    amenities: amenities.map((a) => ({
      ...a,
      category: a.category ?? "Other",
    })),
    bhkTypes: bhk,
    layoutTypes: layouts,
    legalEntities: entities.map((entity) => ({
      id: entity.id,
      label: entity.legalName,
    })),
  };
};

export interface SubmissionDetail extends SubmissionQueueItem {
  /** The latest RERA fetch for this submission or its property, and how it
   * compares with what the submission holds now. */
  rera: ReraState;
  /** The published property this submission changes; `null` for a new property. */
  propertyId: string | null;
  /** For an edit of a published property: the values currently live, by field
   * key. Empty for a new property. Simple fields only. */
  live: Record<string, unknown>;
  fields: {
    fieldKey: string;
    label: string;
    dataType: string;
    value: unknown;
    confidence: string | null;
    reviewStatus: string;
    evidence: { sourcePage: number; sourceSnippet: string | null }[];
  }[];
  developerId: string | null;
  /** The latest brochure extraction attempt; `null` for a submission with no brochure. */
  extraction: {
    jobId: string;
    status: string;
    failureMessage: string | null;
  } | null;
  availableFields: { fieldKey: string; label: string; dataType: string }[];
  lookups: SubmissionLookups;
  media: {
    id: string;
    /** Where the file is stored; the page turns it into a short-lived preview URL. */
    storagePath: string;
    unitVariantName: string | null;
    mediaType: "photo" | "floor_plan" | "video" | "brochure_pdf";
    sourceKind: "developer_brochure" | "own" | "developer_supplied";
    caption: string | null;
    attribution: string;
    displayOrder: number;
    isPublic: boolean;
    reviewStatus: string;
  }[];
}

export const getSubmissionDetail = async (
  database: PostgresJsDatabase,
  id: string,
): Promise<SubmissionDetail | null> => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [item] = await listSubmissionQueue(database, { id });
  if (!item) return null;
  const [owner] = await database
    .select({
      developerId: propertySubmissions.developerId,
      propertyId: propertySubmissions.propertyId,
    })
    .from(propertySubmissions)
    .where(eq(propertySubmissions.id, id));
  const fields = await database
    .select({
      fieldKey: propertySubmissionFields.fieldKey,
      label: propertySchemaFields.label,
      dataType: propertySchemaFields.dataType,
      value: propertySubmissionFields.value,
      confidence: propertySubmissionFields.confidence,
      reviewStatus: propertySubmissionFields.reviewStatus,
    })
    .from(propertySubmissionFields)
    .innerJoin(
      propertySchemaFields,
      eq(propertySchemaFields.fieldKey, propertySubmissionFields.fieldKey),
    )
    .where(eq(propertySubmissionFields.submissionId, id))
    .orderBy(propertySubmissionFields.fieldKey);
  const evidenceRows = await database
    .select({
      fieldKey: propertySubmissionFields.fieldKey,
      sourcePage: propertySubmissionFieldEvidence.sourcePage,
      sourceSnippet: propertySubmissionFieldEvidence.sourceSnippet,
    })
    .from(propertySubmissionFieldEvidence)
    .innerJoin(
      propertySubmissionFields,
      eq(
        propertySubmissionFields.id,
        propertySubmissionFieldEvidence.submissionFieldId,
      ),
    )
    .where(eq(propertySubmissionFields.submissionId, id));
  const evidenceByField = new Map<string, (typeof evidenceRows)[number][]>();
  for (const evidence of evidenceRows) {
    evidenceByField.set(evidence.fieldKey, [
      ...(evidenceByField.get(evidence.fieldKey) ?? []),
      evidence,
    ]);
  }
  const availableFields = await database
    .select({
      fieldKey: propertySchemaFields.fieldKey,
      label: propertySchemaFields.label,
      dataType: propertySchemaFields.dataType,
    })
    .from(propertySchemaFields)
    .where(eq(propertySchemaFields.isActive, true))
    .orderBy(propertySchemaFields.fieldKey);
  const media = await database
    .select({
      id: propertySubmissionMedia.id,
      storagePath: propertySubmissionMedia.gcsPath,
      unitVariantName: propertySubmissionMedia.unitVariantName,
      mediaType: propertySubmissionMedia.mediaType,
      sourceKind: propertySubmissionMedia.sourceKind,
      caption: propertySubmissionMedia.caption,
      attribution: propertySubmissionMedia.attribution,
      displayOrder: propertySubmissionMedia.displayOrder,
      isPublic: propertySubmissionMedia.isPublic,
      reviewStatus: propertySubmissionMedia.reviewStatus,
    })
    .from(propertySubmissionMedia)
    .where(eq(propertySubmissionMedia.submissionId, id))
    .orderBy(propertySubmissionMedia.displayOrder);
  const [job] = await database
    .select({
      id: ocrExtractionJobs.id,
      status: ocrExtractionJobs.status,
      errorCode: ocrExtractionJobs.errorCode,
      errorMessage: ocrExtractionJobs.errorMessage,
    })
    .from(ocrExtractionJobs)
    .where(eq(ocrExtractionJobs.submissionId, id))
    .orderBy(desc(ocrExtractionJobs.createdAt))
    .limit(1);
  return {
    ...item,
    extraction: job
      ? {
          jobId: job.id,
          status: job.status,
          failureMessage:
            job.status === "failed"
              ? describeExtractionFailure(job.errorCode, job.errorMessage)
              : null,
        }
      : null,
    fields: fields.map((field) => ({
      ...field,
      evidence: evidenceByField.get(field.fieldKey) ?? [],
    })),
    availableFields,
    rera: await getReraState(database, id),
    propertyId: owner?.propertyId ?? null,
    live: owner?.propertyId
      ? await loadLiveValues(database, owner.propertyId)
      : {},
    developerId: owner?.developerId ?? null,
    lookups: await getSubmissionLookups(database, owner?.developerId ?? null),
    media,
  };
};
