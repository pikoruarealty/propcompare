import { and, asc, eq, lt } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { ocrExtractionJobs } from "@/db/schema/catalog";
import { OcrAdapterError, type OcrProviderAdapter } from "./adapter";
import { executeOcrExtractionJob, OcrJobNotClaimedError } from "./ingestion";

/**
 * The extraction worker: the one consumer of the `queued` OCR attempts that an
 * admin confirms in the page-review screen.
 *
 * - Durable: the queue is the `ocr_extraction_jobs` table, so a restart loses
 *   nothing that was queued.
 * - Safe to run more than once: claiming is the conditional `queued ->
 *   processing` update inside `executeOcrExtractionJob`, so two workers never run
 *   the same job.
 * - Self-healing: a running job refreshes `updated_at` as a heartbeat; a job
 *   left `processing` with no heartbeat (the process died) is failed as
 *   `worker_interrupted` so it shows up in the UI and can be retried.
 *
 * Only jobs an admin has explicitly queued are ever picked up. Nothing here runs
 * on upload or when pages are categorized.
 */

export const DEFAULT_POLL_MS = 5_000;
export const DEFAULT_HEARTBEAT_MS = 60_000;
export const DEFAULT_LEASE_MS = 10 * 60_000;

export type WorkerDatabase = PostgresJsDatabase;

export interface OcrWorkerDeps {
  database: WorkerDatabase;
  /** Built per job so a missing API key fails that job, not the whole worker. */
  createAdapter: () => OcrProviderAdapter;
  heartbeatMs?: number;
  leaseMs?: number;
  /** Restrict the worker to one job. For tests, so they never touch other queued work. */
  onlyJobId?: string;
  log?: (message: string, detail?: unknown) => void;
}

export type WorkerRunResult =
  | { outcome: "idle" }
  | { outcome: "completed"; jobId: string }
  | { outcome: "failed"; jobId: string; code: string }
  | { outcome: "not_claimed"; jobId: string };

/**
 * Fails every job left `processing` whose heartbeat is older than the lease.
 * Returns the ids it recovered.
 */
export const recoverStaleOcrJobs = async (
  database: WorkerDatabase,
  options: { leaseMs?: number; now?: Date; onlyJobId?: string } = {},
): Promise<string[]> => {
  const now = options.now ?? new Date();
  const cutoff = new Date(
    now.getTime() - (options.leaseMs ?? DEFAULT_LEASE_MS),
  );
  const rows = await database
    .update(ocrExtractionJobs)
    .set({
      status: "failed",
      completedAt: now,
      errorCode: "worker_interrupted",
      errorMessage:
        "The extraction was interrupted before it finished (the server stopped or restarted).",
    })
    .where(
      and(
        eq(ocrExtractionJobs.status, "processing"),
        lt(ocrExtractionJobs.updatedAt, cutoff),
        options.onlyJobId
          ? eq(ocrExtractionJobs.id, options.onlyJobId)
          : undefined,
      ),
    )
    .returning({ id: ocrExtractionJobs.id });
  return rows.map((row) => row.id);
};

const failQueuedJob = async (
  database: WorkerDatabase,
  jobId: string,
  code: string,
  message: string,
): Promise<boolean> => {
  const rows = await database
    .update(ocrExtractionJobs)
    .set({
      status: "failed",
      completedAt: new Date(),
      errorCode: code,
      errorMessage: message.slice(0, 4_000),
    })
    .where(
      and(
        eq(ocrExtractionJobs.id, jobId),
        eq(ocrExtractionJobs.status, "queued"),
      ),
    )
    .returning({ id: ocrExtractionJobs.id });
  return rows.length > 0;
};

/** Claims and runs the oldest queued job, if there is one. */
export const runNextQueuedOcrJob = async (
  deps: OcrWorkerDeps,
): Promise<WorkerRunResult> => {
  const { database } = deps;
  const log = deps.log ?? (() => undefined);

  const [next] = await database
    .select({ id: ocrExtractionJobs.id })
    .from(ocrExtractionJobs)
    .where(
      and(
        eq(ocrExtractionJobs.status, "queued"),
        deps.onlyJobId ? eq(ocrExtractionJobs.id, deps.onlyJobId) : undefined,
      ),
    )
    .orderBy(asc(ocrExtractionJobs.updatedAt))
    .limit(1);
  if (!next) return { outcome: "idle" };
  const jobId = next.id;

  let adapter: OcrProviderAdapter;
  try {
    adapter = deps.createAdapter();
  } catch (error) {
    const code =
      error instanceof OcrAdapterError ? error.code : "configuration_error";
    log(`extraction ${jobId} cannot start`, error);
    return (await failQueuedJob(database, jobId, code, String(error)))
      ? { outcome: "failed", jobId, code }
      : { outcome: "not_claimed", jobId };
  }

  // Started before the claim so a slow start cannot look like a dead worker; the
  // conditional update only touches a job this worker owns.
  const heartbeat = setInterval(() => {
    database
      .update(ocrExtractionJobs)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(ocrExtractionJobs.id, jobId),
          eq(ocrExtractionJobs.status, "processing"),
        ),
      )
      .catch((error) => log(`heartbeat for ${jobId} failed`, error));
  }, deps.heartbeatMs ?? DEFAULT_HEARTBEAT_MS);
  heartbeat.unref?.();

  try {
    log(`extraction ${jobId} started`);
    await executeOcrExtractionJob({ jobId, adapter });
    log(`extraction ${jobId} completed`);
    return { outcome: "completed", jobId };
  } catch (error) {
    if (error instanceof OcrJobNotClaimedError) {
      return { outcome: "not_claimed", jobId };
    }
    // `executeOcrExtractionJob` has already marked the job failed and recorded
    // the spend; the worker only reports it.
    const code =
      error instanceof OcrAdapterError ? error.code : "unexpected_error";
    log(`extraction ${jobId} failed (${code})`, error);
    // A failure before the claim (for example an unreadable manifest) leaves the
    // job queued; fail it here so the worker never spins on the same job.
    await failQueuedJob(database, jobId, code, String(error)).catch(
      () => undefined,
    );
    return { outcome: "failed", jobId, code };
  } finally {
    clearInterval(heartbeat);
  }
};

export interface OcrWorkerHandle {
  stop: () => Promise<void>;
}

/** Polls for queued work until stopped. */
export const startOcrWorker = (
  deps: OcrWorkerDeps & { pollMs?: number },
): OcrWorkerHandle => {
  const pollMs = deps.pollMs ?? DEFAULT_POLL_MS;
  const log = deps.log ?? (() => undefined);
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let current: Promise<void> = Promise.resolve();

  const tick = async (): Promise<void> => {
    try {
      const recovered = await recoverStaleOcrJobs(deps.database, {
        leaseMs: deps.leaseMs,
      });
      if (recovered.length > 0) {
        log(`marked ${recovered.length} interrupted extraction(s) as failed`);
      }
      // Drain the queue; a job that another worker claimed is simply skipped.
      while (!stopped) {
        const result = await runNextQueuedOcrJob(deps);
        if (result.outcome === "idle") break;
      }
    } catch (error) {
      log("extraction worker tick failed", error);
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
