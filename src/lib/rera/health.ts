import { and, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  properties,
  propertySubmissions,
  reraFetchJobs,
} from "@/db/schema/catalog";

/**
 * Whether the scheduled RERA checks are working. A failed check is retried with a
 * growing delay and never reads as "no change", but nothing told a person that a
 * property's checks kept failing. This reports every published property whose most
 * recent checks failed in a row, with the reason, for the admin queue to show.
 * Read only.
 */
export const FAILING_AFTER = 2;

export interface FailingReraCheck {
  propertyId: string;
  propertyName: string;
  /** The property's latest submission, to open from the notice. */
  submissionId: string | null;
  /** Failed attempts in a row, newest first. */
  consecutiveFailures: number;
  lastError: string | null;
  lastAttemptAt: Date;
  /** The last time a check worked, or null if none ever has. */
  lastSuccessAt: Date | null;
}

export const listFailingReraChecks = async (
  database: PostgresJsDatabase,
): Promise<FailingReraCheck[]> => {
  const candidates = await database
    .select({ id: properties.id, name: properties.name })
    .from(properties)
    .where(
      and(
        isNotNull(properties.reraRegistrationNumber),
        ne(properties.listingStatus, "deleted"),
      ),
    );
  if (candidates.length === 0) return [];

  const jobs = await database
    .select({
      propertyId: reraFetchJobs.propertyId,
      status: reraFetchJobs.status,
      error: reraFetchJobs.error,
      runAt: reraFetchJobs.runAt,
      createdAt: reraFetchJobs.createdAt,
    })
    .from(reraFetchJobs)
    .where(
      inArray(
        reraFetchJobs.propertyId,
        candidates.map((property) => property.id),
      ),
    )
    .orderBy(desc(reraFetchJobs.createdAt));

  const failing: FailingReraCheck[] = [];
  for (const property of candidates) {
    // A check still running has not failed or worked yet: skip it.
    const attempts = jobs.filter(
      (job) => job.propertyId === property.id && job.status !== "running",
    );
    let consecutiveFailures = 0;
    for (const attempt of attempts) {
      if (attempt.status !== "failed") break;
      consecutiveFailures += 1;
    }
    if (consecutiveFailures < FAILING_AFTER) continue;
    const success = attempts.find((attempt) => attempt.status === "succeeded");
    const [latest] = await database
      .select({ id: propertySubmissions.id })
      .from(propertySubmissions)
      .where(eq(propertySubmissions.propertyId, property.id))
      .orderBy(desc(propertySubmissions.createdAt))
      .limit(1);
    failing.push({
      propertyId: property.id,
      propertyName: property.name,
      submissionId: latest?.id ?? null,
      consecutiveFailures,
      lastError: attempts[0].error,
      lastAttemptAt: attempts[0].runAt ?? attempts[0].createdAt,
      lastSuccessAt: success ? (success.runAt ?? success.createdAt) : null,
    });
  }
  return failing;
};
