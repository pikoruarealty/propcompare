import { desc, eq, type SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  developers,
  ocrExtractionJobs,
  propertySubmissions,
  sourceDocuments,
} from "@/db/schema/catalog";

export interface SubmissionBrochure {
  submissionId: string;
  developerId: string | null;
  developerName: string | null;
  sourceDocumentId: string;
  storagePath: string;
  pageCount: number;
  ocrJobId: string;
  ocrJobStatus: string;
  ocrErrorCode: string | null;
  ocrErrorMessage: string | null;
  routingManifest: unknown;
}

/**
 * The brochure behind a submission (or, with `by: "job"`, behind an OCR attempt
 * id, in which case the first argument is that job id): its stored file, page count, and the latest
 * OCR attempt (which carries the page-routing manifest). `null` when the id is
 * malformed, unknown, or the submission was not created from a brochure.
 *
 * A submission that adds pictures to an already-published property (an edit
 * started from "Edit this property", not a fresh brochure upload) has no OCR
 * attempt of its own. For that case only (`by: "submission"`, no direct match),
 * this falls back to the same property's most recent brochure from any of its
 * other submissions — mirroring `latestRegulatorCheck`'s reach across a
 * property's submission history — so its pages can still be pulled in as
 * pictures. The returned `submissionId` is still the one asked for, so a
 * caller that adds media keeps writing to the right (editable) submission;
 * only the file, page count and routing manifest come from elsewhere. Mutating
 * actions (confirming routing, retrying extraction) are unaffected: they all
 * require `ocrJobStatus === "draft"`, which a fallback job from a published
 * property's history will not be.
 */
export const getSubmissionBrochure = async (
  database: PostgresJsDatabase,
  submissionId: string,
  by: "submission" | "job" = "submission",
): Promise<SubmissionBrochure | null> => {
  if (!/^[0-9a-f-]{36}$/i.test(submissionId)) return null;
  const select = (condition: SQL) =>
    database
      .select({
        submissionId: propertySubmissions.id,
        developerId: propertySubmissions.developerId,
        developerName: developers.name,
        sourceDocumentId: sourceDocuments.id,
        storagePath: sourceDocuments.gcsPath,
        pageCount: sourceDocuments.pageCount,
        ocrJobId: ocrExtractionJobs.id,
        ocrJobStatus: ocrExtractionJobs.status,
        ocrErrorCode: ocrExtractionJobs.errorCode,
        ocrErrorMessage: ocrExtractionJobs.errorMessage,
        routingManifest: ocrExtractionJobs.routingManifest,
      })
      .from(ocrExtractionJobs)
      .innerJoin(
        propertySubmissions,
        eq(propertySubmissions.id, ocrExtractionJobs.submissionId),
      )
      .innerJoin(
        sourceDocuments,
        eq(sourceDocuments.id, ocrExtractionJobs.sourceDocumentId),
      )
      .leftJoin(developers, eq(developers.id, propertySubmissions.developerId))
      .where(condition)
      .orderBy(desc(ocrExtractionJobs.createdAt))
      .limit(1);

  const [row] = await select(
    by === "job"
      ? eq(ocrExtractionJobs.id, submissionId)
      : eq(ocrExtractionJobs.submissionId, submissionId),
  );
  if (row && row.pageCount !== null)
    return { ...row, pageCount: row.pageCount };
  if (row || by === "job") return null;

  const [thisSubmission] = await database
    .select({ propertyId: propertySubmissions.propertyId })
    .from(propertySubmissions)
    .where(eq(propertySubmissions.id, submissionId));
  if (!thisSubmission?.propertyId) return null;

  const [fallback] = await select(
    eq(propertySubmissions.propertyId, thisSubmission.propertyId),
  );
  if (!fallback || fallback.pageCount === null) return null;
  return { ...fallback, submissionId, pageCount: fallback.pageCount };
};
