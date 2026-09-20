import { startConfiguredReraWorker } from "@/lib/rera/worker-runtime";

/**
 * Runs the quarterly RERA refresh on its own: `bun run rera:worker`.
 * Use this on a host where the web server does not set RERA_WORKER_ENABLED=true.
 */
const worker = startConfiguredReraWorker();
console.info("[rera-worker] running; press Ctrl+C to stop");

const shutdown = async () => {
  await worker.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
