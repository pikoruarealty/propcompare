/**
 * Starts the background workers inside the app server, so `bun run dev` and
 * `bun run start` are enough to take a queued brochure through extraction.
 *
 * Both are skipped in tests. The extraction worker is on unless
 * `OCR_WORKER_ENABLED=false` (a web-only host that runs `bun run ocr:worker`
 * separately) and only ever picks up jobs an admin has explicitly queued. The
 * quarterly RERA refresh reads a public regulator site by itself, so it is off
 * unless `RERA_WORKER_ENABLED=true` (or run `bun run rera:worker`).
 */
const OCR_WORKER_KEY = Symbol.for("propcompare.ocrWorker");
const RERA_WORKER_KEY = Symbol.for("propcompare.reraWorker");

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV === "test") return;

  // Development reloads re-run register(); keep exactly one loop per process.
  const globals = globalThis as unknown as Record<symbol, unknown>;

  if (process.env.OCR_WORKER_ENABLED !== "false" && !globals[OCR_WORKER_KEY]) {
    const { startConfiguredOcrWorker } =
      await import("@/lib/ocr/worker-runtime");
    globals[OCR_WORKER_KEY] = startConfiguredOcrWorker();
  }

  if (process.env.RERA_WORKER_ENABLED === "true" && !globals[RERA_WORKER_KEY]) {
    const { startConfiguredReraWorker } =
      await import("@/lib/rera/worker-runtime");
    globals[RERA_WORKER_KEY] = startConfiguredReraWorker();
  }
}
