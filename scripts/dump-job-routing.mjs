/**
 * Writes the confirmed routing manifest of an OCR job to a JSON file, so a
 * rehearsal can pick exactly the same pages.
 *
 *   node scripts/dump-job-routing.mjs <ocr-job-id> <out.json>
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import postgres from "postgres";

const [jobId, out] = process.argv.slice(2);
if (!jobId || !out)
  throw new Error("Usage: dump-job-routing <ocr-job-id> <out.json>");
const sql = postgres(
  process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL,
);
const [job] =
  await sql`select routing_manifest from ocr_extraction_jobs where id = ${jobId}`;
await sql.end();
if (!job) throw new Error("No such job.");
writeFileSync(out, JSON.stringify(job.routing_manifest, null, 2));
const scopes = job.routing_manifest.scopes ?? [];
for (const scope of scopes) {
  console.log(
    scope.kind,
    scope.scopeKey,
    scope.pages.map((p) => p.pageNumber).join(","),
  );
}
