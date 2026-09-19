import { and, desc, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  developers,
  properties,
  propertySubmissionFields,
  propertySubmissions,
  type submissionStatus,
} from "@/db/schema/catalog";

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

export interface SubmissionDetail extends SubmissionQueueItem {
  fields: {
    fieldKey: string;
    value: unknown;
    confidence: string | null;
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
  const fields = await database
    .select({
      fieldKey: propertySubmissionFields.fieldKey,
      value: propertySubmissionFields.value,
      confidence: propertySubmissionFields.confidence,
      reviewStatus: propertySubmissionFields.reviewStatus,
    })
    .from(propertySubmissionFields)
    .where(eq(propertySubmissionFields.submissionId, id))
    .orderBy(propertySubmissionFields.fieldKey);
  return { ...item, fields };
};
