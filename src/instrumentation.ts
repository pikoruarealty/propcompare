/**
 * Starts the brochure-extraction worker inside the app server, so `bun run dev`
 * and `bun run start` are enough to take a queued brochure through extraction.
 *
 * Skipped in tests and when `OCR_WORKER_ENABLED=false` (a web-only host that runs
 * `bun run ocr:worker` separately). The worker only ever picks up jobs an admin
 * has explicitly queued.
 */
const WORKER_KEY = Symbol.for("propcompare.ocrWorker");

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NODE_ENV === "test") return;
    if (process.env.OCR_WORKER_ENABLED === "false") return;

    // Development reloads re-run register(); keep exactly one loop per process.
    const globals = globalThis as unknown as Record<symbol, unknown>;
    if (globals[WORKER_KEY]) return;

    const { startConfiguredOcrWorker } =
      await import("@/lib/ocr/worker-runtime");
    globals[WORKER_KEY] = startConfiguredOcrWorker();
  }
}
