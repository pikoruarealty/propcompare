import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  ocrExtractionJobs,
  propertyMedia,
  propertySubmissionFieldEvidence,
  propertySubmissionMedia,
  propertySubmissions,
  sourceDocuments,
} from "@/db/schema/catalog";
import type { StorageAdapter } from "@/lib/storage/adapter";

/**
 * Clearing a submission out of the admin queue (`DECISIONS.md` 2026-09-24).
 *
 * - **Never published: deleted outright.** A draft, a rejected one, anything that
 *   is not `published` has never touched the live catalog, so nothing depends on
 *   it. Its fields, evidence, images and extraction attempts go with it, and so
 *   do the files only it used. The AI usage ledger keeps its rows (their
 *   submission link is simply cleared), so spend history is never lost.
 * - **Published: archived, never deleted.** `property_revisions` is the record of
 *   what went live and who approved it, and points at the submission. It gets an
 *   `archived_at` and drops out of the default queue; the live listing is
 *   untouched and it can be restored.
 *
 * Neither path writes to a live catalog table.
 */

export class SubmissionRemovalError extends Error {
  constructor(
    public readonly code: "submission_not_found" | "invalid_state",
    message: string,
  ) {
    super(message);
    this.name = "SubmissionRemovalError";
  }
}

export type RemovalOutcome = "deleted" | "archived";

export const removeSubmission = async (
  deps: { database: PostgresJsDatabase; storage: StorageAdapter },
  input: { submissionId: string },
): Promise<{ outcome: RemovalOutcome }> => {
  const { database } = deps;

  const claimed = await database.transaction(async (tx) => {
    // Locked so a publish cannot land between the check and the change.
    const [submission] = await tx
      .select({
        id: propertySubmissions.id,
        status: propertySubmissions.status,
      })
      .from(propertySubmissions)
      .where(eq(propertySubmissions.id, input.submissionId))
      .for("update");
    if (!submission) {
      throw new SubmissionRemovalError(
        "submission_not_found",
        "Submission not found.",
      );
    }

    if (submission.status === "published") {
      await tx
        .update(propertySubmissions)
        .set({ archivedAt: new Date() })
        .where(
          and(
            eq(propertySubmissions.id, submission.id),
            // Archiving twice keeps the first date.
            isNull(propertySubmissions.archivedAt),
          ),
        );
      return { outcome: "archived" as const };
    }

    const [running] = await tx
      .select({ id: ocrExtractionJobs.id })
      .from(ocrExtractionJobs)
      .where(
        and(
          eq(ocrExtractionJobs.submissionId, submission.id),
          inArray(ocrExtractionJobs.status, ["queued", "processing"]),
        ),
      );
    if (running) {
      throw new SubmissionRemovalError(
        "invalid_state",
        "A brochure read is still running for this submission. Wait for it to finish, then delete it.",
      );
    }

    const mediaPaths = (
      await tx
        .select({ path: propertySubmissionMedia.gcsPath })
        .from(propertySubmissionMedia)
        .where(eq(propertySubmissionMedia.submissionId, submission.id))
    ).map((row) => row.path);
    const documentIds = (
      await tx
        .select({ id: ocrExtractionJobs.sourceDocumentId })
        .from(ocrExtractionJobs)
        .where(eq(ocrExtractionJobs.submissionId, submission.id))
    ).map((row) => row.id);

    // Fields, evidence, images and extraction attempts cascade from here.
    await tx
      .delete(propertySubmissions)
      .where(eq(propertySubmissions.id, submission.id));
    return {
      outcome: "deleted" as const,
      mediaPaths: [...new Set(mediaPaths)],
      documentIds: [...new Set(documentIds)],
    };
  });

  if (claimed.outcome === "deleted") {
    await releaseFiles(deps, claimed.mediaPaths, claimed.documentIds);
  }
  return { outcome: claimed.outcome };
};

/**
 * Removes the stored files that only the deleted submission used. A brochure page
 * image has a key derived from its document and page, so an edit's candidate can
 * share a file with a picture that is already live; a file anything else still
 * points at is kept. Storage failures are swallowed: an orphaned file costs
 * disk, and must never undo a delete that has already happened.
 */
const releaseFiles = async (
  deps: { database: PostgresJsDatabase; storage: StorageAdapter },
  mediaPaths: string[],
  documentIds: string[],
): Promise<void> => {
  const { database, storage } = deps;

  for (const path of mediaPaths) {
    const [otherCandidate] = await database
      .select({ id: propertySubmissionMedia.id })
      .from(propertySubmissionMedia)
      .where(eq(propertySubmissionMedia.gcsPath, path))
      .limit(1);
    const [live] = await database
      .select({ id: propertyMedia.id })
      .from(propertyMedia)
      .where(eq(propertyMedia.gcsPath, path))
      .limit(1);
    if (!otherCandidate && !live) {
      await storage.delete(path).catch(() => undefined);
    }
  }

  for (const id of documentIds) {
    const [stillUsed] = await database
      .select({ id: ocrExtractionJobs.id })
      .from(ocrExtractionJobs)
      .where(eq(ocrExtractionJobs.sourceDocumentId, id))
      .limit(1);
    const [cited] = await database
      .select({ id: propertySubmissionFieldEvidence.id })
      .from(propertySubmissionFieldEvidence)
      .where(eq(propertySubmissionFieldEvidence.sourceDocumentId, id))
      .limit(1);
    const [pictured] = await database
      .select({ id: propertySubmissionMedia.id })
      .from(propertySubmissionMedia)
      .where(eq(propertySubmissionMedia.sourceDocumentId, id))
      .limit(1);
    if (stillUsed || cited || pictured) continue;
    const [document] = await database
      .select({ path: sourceDocuments.gcsPath })
      .from(sourceDocuments)
      .where(eq(sourceDocuments.id, id));
    if (!document) continue;
    // A row something else references (a foreign key) stays; so does its file.
    const deleted = await database
      .delete(sourceDocuments)
      .where(eq(sourceDocuments.id, id))
      .returning({ id: sourceDocuments.id })
      .catch(() => []);
    if (deleted.length > 0) {
      await storage.delete(document.path).catch(() => undefined);
    }
  }
};

/** Puts an archived submission back in the default queue. */
export const restoreSubmission = async (
  database: PostgresJsDatabase,
  input: { submissionId: string },
): Promise<void> => {
  const restored = await database
    .update(propertySubmissions)
    .set({ archivedAt: null })
    .where(
      and(
        eq(propertySubmissions.id, input.submissionId),
        isNotNull(propertySubmissions.archivedAt),
      ),
    )
    .returning({ id: propertySubmissions.id });
  if (restored.length === 0) {
    throw new SubmissionRemovalError(
      "invalid_state",
      "That submission is not archived.",
    );
  }
};
