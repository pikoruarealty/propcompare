import { and, eq } from "drizzle-orm";
import { db, dbClient } from "@/db";
import {
  ocrExtractionJobs,
  propertySubmissionFields,
  propertySubmissions,
} from "@/db/schema/catalog";

/**
 * Re-reads a brochure's SAVED provider answers with the current parser, at no
 * provider cost: clears the draft's extracted values and queues the job again; the
 * worker reuses the answers it saved on disk instead of asking again.
 *
 * Refuses unless the submission is still an untouched draft (every value still
 * "needs review"), so no human edit can be lost. Draft data only; it never touches
 * the live catalog.
 *
 *   bun run src/db/reread-saved-answers.ts <submission-id>
 */
const submissionId = process.argv[2];
if (!submissionId) throw new Error("Give the submission id.");

try {
  await db.transaction(async (tx) => {
    const [submission] = await tx
      .select({ status: propertySubmissions.status })
      .from(propertySubmissions)
      .where(eq(propertySubmissions.id, submissionId))
      .for("update");
    if (!submission) throw new Error("No such submission.");
    if (submission.status !== "draft") {
      throw new Error(
        `Only a draft can be re-read; this one is ${submission.status}.`,
      );
    }
    const fields = await tx
      .select({ reviewStatus: propertySubmissionFields.reviewStatus })
      .from(propertySubmissionFields)
      .where(eq(propertySubmissionFields.submissionId, submissionId));
    if (fields.some((field) => field.reviewStatus !== "needs_review")) {
      throw new Error(
        "A value has been edited or reviewed; refusing to overwrite it.",
      );
    }
    const [job] = await tx
      .select({ id: ocrExtractionJobs.id, status: ocrExtractionJobs.status })
      .from(ocrExtractionJobs)
      .where(eq(ocrExtractionJobs.submissionId, submissionId));
    if (!job || job.status !== "completed") {
      throw new Error("The extraction attempt has not completed.");
    }
    await tx
      .delete(propertySubmissionFields)
      .where(eq(propertySubmissionFields.submissionId, submissionId));
    await tx
      .update(ocrExtractionJobs)
      .set({
        status: "queued",
        completedAt: null,
        errorCode: null,
        errorMessage: null,
      })
      .where(
        and(
          eq(ocrExtractionJobs.id, job.id),
          eq(ocrExtractionJobs.status, "completed"),
        ),
      );
  });
  console.info("Queued: the worker will re-read the saved answers.");
} catch (error) {
  console.error("Not done:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await dbClient.end({ timeout: 5 });
}
