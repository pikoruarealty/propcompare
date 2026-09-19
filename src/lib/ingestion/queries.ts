import { desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  developers,
  ocrExtractionJobs,
  propertySubmissions,
  sourceDocuments,
} from "@/db/schema/catalog";

export interface SubmissionBrochure {
  submissionId: string;
  developerName: string | null;
  sourceDocumentId: string;
  storagePath: string;
  pageCount: number;
  ocrJobId: string;
  ocrJobStatus: string;
  routingManifest: unknown;
}

/**
 * The brochure behind a submission: its stored file, page count, and the latest
 * OCR attempt (which carries the page-routing manifest). `null` when the id is
 * malformed, unknown, or the submission was not created from a brochure.
 */
export const getSubmissionBrochure = async (
  database: PostgresJsDatabase,
  submissionId: string,
): Promise<SubmissionBrochure | null> => {
  if (!/^[0-9a-f-]{36}$/i.test(submissionId)) return null;
  const [row] = await database
    .select({
      submissionId: propertySubmissions.id,
      developerName: developers.name,
      sourceDocumentId: sourceDocuments.id,
      storagePath: sourceDocuments.gcsPath,
      pageCount: sourceDocuments.pageCount,
      ocrJobId: ocrExtractionJobs.id,
      ocrJobStatus: ocrExtractionJobs.status,
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
    .where(eq(ocrExtractionJobs.submissionId, submissionId))
    .orderBy(desc(ocrExtractionJobs.createdAt))
    .limit(1);
  if (!row || row.pageCount === null) return null;
  return { ...row, pageCount: row.pageCount };
};
