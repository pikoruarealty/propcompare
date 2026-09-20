import { db } from "@/db";
import {
  DEFAULT_RERA_POLL_MS,
  DEFAULT_RERA_SPACING_MS,
  startReraWorker,
  type ReraWorkerHandle,
} from "./refresh";

const readMs = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 1_000 ? value : fallback;
};

/**
 * The quarterly RERA refresh as the application runs it, shared by the in-server
 * starter (`src/instrumentation.ts`) and `bun run rera:worker`. It reads a public
 * regulator site on its own, so it is off unless `RERA_WORKER_ENABLED=true`.
 * Log lines carry ids and outcomes only, never record contents.
 */
export const startConfiguredReraWorker = (): ReraWorkerHandle =>
  startReraWorker({
    database: db,
    pollMs: readMs("RERA_WORKER_POLL_MS", DEFAULT_RERA_POLL_MS),
    spacingMs: readMs("RERA_WORKER_SPACING_MS", DEFAULT_RERA_SPACING_MS),
    log: (message, detail) => {
      if (detail === undefined) console.info(`[rera-worker] ${message}`);
      else console.error(`[rera-worker] ${message}`, detail);
    },
  });
