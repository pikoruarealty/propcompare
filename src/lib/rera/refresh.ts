import { syncReraPriceRange } from "@/lib/pricing/ranges";
import { and, desc, eq, inArray, isNotNull, lt, ne } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  properties,
  propertySubmissionFields,
  propertySubmissions,
  reraFetchJobs,
} from "@/db/schema/catalog";
import {
  createEditSubmission,
  EditPropertyError,
} from "@/lib/submissions/edit-property";
import { editSubmissionField } from "@/lib/submissions/reconciliation";
import { loadLiveValues } from "@/lib/submissions/live-values";
import {
  compareWithRecord,
  writableItems,
  type ReraComparisonItem,
} from "./mapping";
import { getRegulatorRegistry, type RegulatorRegistry } from "./registry";
import {
  isRegulatorRecord,
  loadAmenityLabels,
  loadEntities,
} from "./submission-fetch";
import { RegulatorError, type RegulatorRecord } from "./types";

/**
 * The scheduled RERA refresh.
 *
 * Promoters file a progress report each calendar quarter (1–7 of the month after
 * quarter end). A published property is *due* once the latest closed quarter's
 * window has passed and the last good record does not yet show a filing for it;
 * it is then re-checked on a spacing that grows with consecutive failures, so a
 * late filer is caught within a week and a regulator outage is never hammered.
 * The windows are a strong default, not a guarantee (late filers pay a daily fee;
 * deadlines have been extended by order), which is why "due" is decided from what
 * the record says rather than from the calendar alone.
 *
 * A check that finds nothing to change writes only its `rera_fetch_jobs` row, and
 * that row is what "last checked" reads. A check that finds a difference opens one
 * edit submission with `source = rera_scrape`, holding RERA's values as
 * `needs_review`; the live catalogue is never touched here. A failed, blocked or
 * unparseable response is a failed job with a reason — never "no change".
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** After the quarter's last day, the filing window is 7 days; wait a day more. */
const WINDOW_GRACE_DAYS = 8;
export const UNFILED_RETRY_MS = 7 * DAY_MS;
export const FAILED_RETRY_MS = DAY_MS;
/** A `running` job with no result this long after it started was interrupted. */
export const STALE_RUNNING_MS = 15 * 60_000;

/** The most recent calendar quarter end (UTC date) whose filing window has closed. */
export const latestClosedQuarter = (now: Date): { periodEnd: string } => {
  const year = now.getUTCFullYear();
  const ends: [number, number, number][] = [
    [year - 1, 8, 30],
    [year - 1, 11, 31],
    [year, 2, 31],
    [year, 5, 30],
    [year, 8, 30],
    [year, 11, 31],
  ];
  let chosen = ends[0];
  for (const end of ends) {
    const closed =
      Date.UTC(end[0], end[1], end[2]) + WINDOW_GRACE_DAYS * DAY_MS;
    if (closed <= now.getTime()) chosen = end;
  }
  const [y, m, d] = chosen;
  return { periodEnd: new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10) };
};

interface PastJob {
  status: "queued" | "running" | "succeeded" | "failed";
  at: Date;
  record: RegulatorRecord | null;
}

/** Whether a record shows a filing for the quarter ending `periodEnd` or later. */
export const showsFilingFor = (
  record: RegulatorRecord | null,
  periodEnd: string,
): boolean =>
  !!record?.latestQuarter?.submittedOn &&
  record.latestQuarter.periodEndsOn >= periodEnd;

/**
 * Whether a property is due, from its past checks (newest first). Pure, so the
 * calendar and back-off rules are tested without a database or a clock.
 */
export const isDue = (jobs: PastJob[], now: Date): boolean => {
  const quarter = latestClosedQuarter(now);
  const lastSucceeded = jobs.find((job) => job.status === "succeeded");
  // Settled: the last good record already shows a filing for the closed quarter.
  if (
    lastSucceeded &&
    showsFilingFor(lastSucceeded.record, quarter.periodEnd)
  ) {
    return false;
  }
  const last = jobs[0];
  if (!last) return true;
  if (last.status === "running" || last.status === "queued") {
    return now.getTime() - last.at.getTime() > STALE_RUNNING_MS;
  }
  let consecutiveFailures = 0;
  for (const job of jobs) {
    if (job.status !== "failed") break;
    consecutiveFailures += 1;
  }
  const wait =
    consecutiveFailures > 0
      ? Math.min(
          UNFILED_RETRY_MS,
          FAILED_RETRY_MS * 2 ** (consecutiveFailures - 1),
        )
      : UNFILED_RETRY_MS;
  return now.getTime() - last.at.getTime() >= wait;
};

/** Fails checks left `running` by a process that died, so they show as failed. */
export const recoverStaleReraJobs = async (
  database: PostgresJsDatabase,
  now = new Date(),
): Promise<number> => {
  const rows = await database
    .update(reraFetchJobs)
    .set({
      status: "failed",
      error: "The check was interrupted before it finished.",
    })
    .where(
      and(
        eq(reraFetchJobs.status, "running"),
        lt(reraFetchJobs.runAt, new Date(now.getTime() - STALE_RUNNING_MS)),
      ),
    )
    .returning({ id: reraFetchJobs.id });
  return rows.length;
};

const recordOf = (payload: unknown): RegulatorRecord | null => {
  const record = (payload as { record?: unknown } | null)?.record;
  return isRegulatorRecord(record) ? record : null;
};

export interface ClaimedRefresh {
  jobId: string;
  propertyId: string;
  registrationNumber: string;
  regulatorCode: string;
}

/**
 * Finds the next due property and claims it by inserting a `running` job, all
 * under a row lock on the property so two workers never check the same one: the
 * second skips a locked row, and after the first commits it sees the fresh job and
 * finds the property no longer due.
 */
export const claimNextDueRefresh = async (
  database: PostgresJsDatabase,
  options: {
    now?: Date;
    registry?: RegulatorRegistry;
    /** Restrict the check to these properties. For tests, so they never touch a
     * real listing in the same database. */
    onlyPropertyIds?: string[];
  } = {},
): Promise<ClaimedRefresh | null> => {
  const now = options.now ?? new Date();
  const registry = options.registry ?? getRegulatorRegistry();
  const candidates = await database
    .select({
      id: properties.id,
      registrationNumber: properties.reraRegistrationNumber,
    })
    .from(properties)
    .where(
      and(
        isNotNull(properties.reraRegistrationNumber),
        ne(properties.listingStatus, "deleted"),
        options.onlyPropertyIds
          ? inArray(properties.id, options.onlyPropertyIds)
          : undefined,
      ),
    );

  for (const candidate of candidates) {
    const number = candidate.registrationNumber;
    if (!number) continue;
    const adapter = registry.forRegistrationNumber(number);
    if (!adapter) continue;

    const claimed = await database.transaction(async (tx) => {
      const [locked] = await tx
        .select({ id: properties.id })
        .from(properties)
        .where(eq(properties.id, candidate.id))
        .for("update", { skipLocked: true });
      if (!locked) return null;

      const rows = await tx
        .select({
          status: reraFetchJobs.status,
          runAt: reraFetchJobs.runAt,
          createdAt: reraFetchJobs.createdAt,
          payload: reraFetchJobs.fetchedPayload,
        })
        .from(reraFetchJobs)
        .where(eq(reraFetchJobs.propertyId, candidate.id))
        .orderBy(desc(reraFetchJobs.createdAt))
        .limit(12);
      const jobs: PastJob[] = rows.map((row) => ({
        status: row.status,
        at: row.runAt ?? row.createdAt,
        record: recordOf(row.payload),
      }));
      if (!isDue(jobs, now)) return null;

      const [job] = await tx
        .insert(reraFetchJobs)
        .values({
          propertyId: candidate.id,
          reraRegistrationNumber: number.toUpperCase(),
          regulatorCode: adapter.code,
          status: "running",
          runAt: now,
        })
        .returning({ id: reraFetchJobs.id });
      return job.id;
    });
    if (claimed) {
      return {
        jobId: claimed,
        propertyId: candidate.id,
        registrationNumber: number,
        regulatorCode: adapter.code,
      };
    }
  }
  return null;
};

export type RefreshOutcome =
  | { outcome: "failed"; jobId: string; reason: string }
  | { outcome: "unchanged"; jobId: string }
  | { outcome: "proposed"; jobId: string; submissionId: string }
  | { outcome: "edit_open"; jobId: string; submissionId: string }
  | { outcome: "already_declined"; jobId: string };

/** What a proposal would write, in a form two proposals can be compared by. */
const fingerprint = (entries: { fieldKey: string; value: unknown }[]): string =>
  JSON.stringify(
    [...entries]
      .sort((a, b) => a.fieldKey.localeCompare(b.fieldKey))
      .map((entry) => [entry.fieldKey, entry.value]),
  );

/**
 * True when the newest scheduled proposal for this property was rejected and
 * proposed exactly what is proposed now: the admin has already said no to this
 * change, so it is not put in front of them again every quarter. A changed RERA
 * value is a different proposal and is raised.
 */
const alreadyDeclined = async (
  database: PostgresJsDatabase,
  propertyId: string,
  items: ReraComparisonItem[],
): Promise<boolean> => {
  const [previous] = await database
    .select({ id: propertySubmissions.id, status: propertySubmissions.status })
    .from(propertySubmissions)
    .where(
      and(
        eq(propertySubmissions.propertyId, propertyId),
        eq(propertySubmissions.source, "rera_scrape"),
      ),
    )
    .orderBy(desc(propertySubmissions.createdAt))
    .limit(1);
  if (!previous || previous.status !== "rejected") return false;
  const held = await database
    .select({
      fieldKey: propertySubmissionFields.fieldKey,
      value: propertySubmissionFields.value,
    })
    .from(propertySubmissionFields)
    .where(eq(propertySubmissionFields.submissionId, previous.id));
  return (
    fingerprint(held) ===
    fingerprint(
      items.map((item) => ({
        fieldKey: item.fieldKey,
        value: item.proposedValue,
      })),
    )
  );
};

/** Runs a claimed check: looks the number up and records the result. */
export const runClaimedRefresh = async (
  database: PostgresJsDatabase,
  claim: ClaimedRefresh,
  options: { registry?: RegulatorRegistry } = {},
): Promise<RefreshOutcome> => {
  const adapter = (options.registry ?? getRegulatorRegistry()).byCode(
    claim.regulatorCode,
  );
  const fail = async (reason: string): Promise<RefreshOutcome> => {
    await database
      .update(reraFetchJobs)
      .set({ status: "failed", error: reason })
      .where(eq(reraFetchJobs.id, claim.jobId));
    return { outcome: "failed", jobId: claim.jobId, reason };
  };
  if (!adapter) return fail("No adapter is registered for this regulator.");

  let record: RegulatorRecord;
  try {
    record = await adapter.lookupByRegistrationNumber(claim.registrationNumber);
  } catch (cause) {
    return fail(
      cause instanceof RegulatorError
        ? cause.message
        : "The lookup failed unexpectedly.",
    );
  }

  const [current, entities, amenityLabels] = await Promise.all([
    loadLiveValues(database, claim.propertyId),
    loadEntities(database, {
      developerId: null,
      propertyId: claim.propertyId,
    }),
    loadAmenityLabels(database),
  ]);
  const comparison = compareWithRecord(
    record,
    current,
    entities,
    amenityLabels,
  );
  await database
    .update(reraFetchJobs)
    .set({
      status: "succeeded",
      externalProjectId: record.externalProjectId,
      fetchedPayload: { record },
      matchedFields: comparison.map(({ fieldKey, status }) => ({
        fieldKey,
        status,
      })),
    })
    .where(eq(reraFetchJobs.id, claim.jobId));
  // The project's stated price range goes to the private schema, never into the
  // record above; best effort, so it cannot fail the check.
  await syncReraPriceRange({
    adapter,
    registrationNumber: claim.registrationNumber,
  });

  const items = writableItems(comparison);
  if (items.length === 0) return { outcome: "unchanged", jobId: claim.jobId };
  if (await alreadyDeclined(database, claim.propertyId, items)) {
    return { outcome: "already_declined", jobId: claim.jobId };
  }

  let submissionId: string;
  try {
    ({ submissionId } = await createEditSubmission(database, {
      propertyId: claim.propertyId,
      submittedBy: null,
      source: "rera_scrape",
    }));
  } catch (cause) {
    // An edit is already open: the difference shows in it (the RERA panel
    // compares against whatever the edit holds), so a second draft would only
    // compete with it.
    if (cause instanceof EditPropertyError && cause.submissionId) {
      return {
        outcome: "edit_open",
        jobId: claim.jobId,
        submissionId: cause.submissionId,
      };
    }
    throw cause;
  }

  await database
    .update(reraFetchJobs)
    .set({ submissionId })
    .where(eq(reraFetchJobs.id, claim.jobId));
  for (const item of items) {
    await editSubmissionField(database, {
      submissionId,
      fieldKey: item.fieldKey,
      value: item.proposedValue,
      reviewStatus: "needs_review",
    });
  }
  return { outcome: "proposed", jobId: claim.jobId, submissionId };
};

export interface ReraWorkerDeps {
  database: PostgresJsDatabase;
  registry?: RegulatorRegistry;
  /** Restrict the worker to these properties (tests only). */
  onlyPropertyIds?: string[];
  /** Pause between two regulator requests, so a backlog is never a burst. */
  spacingMs?: number;
  log?: (message: string, detail?: unknown) => void;
}

/** Claims and runs at most one due check. */
export const runNextDueRefresh = async (
  deps: ReraWorkerDeps,
  now = new Date(),
): Promise<RefreshOutcome | { outcome: "idle" }> => {
  const claim = await claimNextDueRefresh(deps.database, {
    now,
    registry: deps.registry,
    onlyPropertyIds: deps.onlyPropertyIds,
  });
  if (!claim) return { outcome: "idle" };
  try {
    return await runClaimedRefresh(deps.database, claim, {
      registry: deps.registry,
    });
  } catch (cause) {
    // Anything unforeseen is still a failed job, never a silent "no change".
    deps.log?.(`check ${claim.jobId} failed unexpectedly`, cause);
    await deps.database
      .update(reraFetchJobs)
      .set({ status: "failed", error: "The check failed unexpectedly." })
      .where(
        and(
          eq(reraFetchJobs.id, claim.jobId),
          inArray(reraFetchJobs.status, ["running", "succeeded"]),
        ),
      );
    return {
      outcome: "failed",
      jobId: claim.jobId,
      reason: "The check failed unexpectedly.",
    };
  }
};

export const DEFAULT_RERA_POLL_MS = 60 * 60_000;
export const DEFAULT_RERA_SPACING_MS = 15_000;

export interface ReraWorkerHandle {
  stop: () => Promise<void>;
}

/** Looks for due properties on an interval, one request at a time, until stopped. */
export const startReraWorker = (
  deps: ReraWorkerDeps & { pollMs?: number },
): ReraWorkerHandle => {
  const pollMs = deps.pollMs ?? DEFAULT_RERA_POLL_MS;
  const spacingMs = deps.spacingMs ?? DEFAULT_RERA_SPACING_MS;
  const log = deps.log ?? (() => undefined);
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let current: Promise<void> = Promise.resolve();

  const pause = (ms: number) =>
    new Promise<void>((resolve) => {
      const wait = setTimeout(resolve, ms);
      wait.unref?.();
    });

  const tick = async (): Promise<void> => {
    try {
      const recovered = await recoverStaleReraJobs(deps.database);
      if (recovered > 0) log(`marked ${recovered} interrupted check(s) failed`);
      while (!stopped) {
        const result = await runNextDueRefresh(deps);
        if (result.outcome === "idle") break;
        log(`check ${result.jobId}: ${result.outcome}`);
        await pause(spacingMs);
      }
    } catch (error) {
      log("RERA worker tick failed", error);
    }
    if (!stopped) {
      timer = setTimeout(() => {
        current = tick();
      }, pollMs);
      timer.unref?.();
    }
  };

  current = tick();
  return {
    stop: async () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      await current;
    },
  };
};
