import { startConfiguredOcrWorker } from "@/lib/ocr/worker-runtime";

/**
 * Runs the brochure-extraction worker on its own: `bun run ocr:worker`.
 * Use this on a host where the web server sets OCR_WORKER_ENABLED=false.
 */
const worker = startConfiguredOcrWorker();
console.info("[ocr-worker] running; press Ctrl+C to stop");

const shutdown = async () => {
  await worker.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
