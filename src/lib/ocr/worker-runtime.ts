import { db } from "@/db";
import { storageAdapter } from "@/lib/storage";
import { createOpenRouterOcrAdapter } from "./adapter";
import {
  DEFAULT_HEARTBEAT_MS,
  DEFAULT_LEASE_MS,
  DEFAULT_POLL_MS,
  startOcrWorker,
  type OcrWorkerHandle,
} from "./worker";

const readMs = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 1_000 ? value : fallback;
};

/**
 * The worker as the application runs it: brochures are read through the
 * configured storage adapter and extracted with the OpenRouter adapter. Shared by
 * the in-server starter (`src/instrumentation.ts`) and `bun run ocr:worker`.
 * Log lines carry ids and error codes only, never document text or keys.
 */
export const startConfiguredOcrWorker = (): OcrWorkerHandle =>
  startOcrWorker({
    database: db,
    createAdapter: () =>
      createOpenRouterOcrAdapter({
        loadSourcePdf: (path) => storageAdapter.download(path),
        // Lets a check point the worker at a stand-in provider; unset in production.
        endpoint: process.env.OPENROUTER_OCR_ENDPOINT || undefined,
      }),
    pollMs: readMs("OCR_WORKER_POLL_MS", DEFAULT_POLL_MS),
    leaseMs: readMs("OCR_WORKER_LEASE_MS", DEFAULT_LEASE_MS),
    heartbeatMs: readMs("OCR_WORKER_HEARTBEAT_MS", DEFAULT_HEARTBEAT_MS),
    log: (message, detail) => {
      if (detail === undefined) console.info(`[ocr-worker] ${message}`);
      else console.error(`[ocr-worker] ${message}`, detail);
    },
  });
