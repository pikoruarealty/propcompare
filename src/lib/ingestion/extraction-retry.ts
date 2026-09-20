import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { ocrExtractionJobs } from "@/db/schema/catalog";
import { getSubmissionBrochure } from "./queries";
import { RoutingConfirmationError } from "./routing-confirmation";

/**
 * Gives a failed extraction another go. Two ways, both admin choices:
 *
 * - `requeue`: run the same confirmed pages again. This is a second paid run, so
 *   the screen asks for its own confirmation (with no price).
 * - `edit_pages`: put the attempt back to a draft so the page choices can be
 *   changed first (for example after a group of pages was too large to read).
 *
 * Only a failed attempt moves, by a conditional update, so a concurrent worker or
 * a second click cannot double-queue it. Nothing here calls a provider.
 */
export const reopenFailedOcr = async (
  database: PostgresJsDatabase,
  ocrJobId: string,
  mode: "requeue" | "edit_pages",
): Promise<void> => {
  const brochure = await getSubmissionBrochure(database, ocrJobId, "job");
  if (!brochure) {
    throw new RoutingConfirmationError(
      "job_not_found",
      "No such brochure attempt.",
    );
  }
  const updated = await database
    .update(ocrExtractionJobs)
    .set({
      status: mode === "requeue" ? "queued" : "draft",
      startedAt: null,
      completedAt: null,
      errorCode: null,
      errorMessage: null,
    })
    .where(
      and(
        eq(ocrExtractionJobs.id, brochure.ocrJobId),
        eq(ocrExtractionJobs.status, "failed"),
      ),
    )
    .returning({ id: ocrExtractionJobs.id });
  if (updated.length === 0) {
    throw new RoutingConfirmationError(
      "job_not_draft",
      "Only a failed extraction can be tried again.",
    );
  }
};
