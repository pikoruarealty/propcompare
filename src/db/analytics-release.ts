/**
 * Releases developer analytics (schema v21, `DECISIONS.md` 2026-09-26): counts
 * the raw events through the last whole India-time day and writes only the
 * figures a developer may see. Schedule it daily, after `analytics:purge`; a
 * failed run leaves the previous figures in place, marked stale.
 * `bun run analytics:release`
 */
import { db, dbClient } from "./index";
import { releaseDeveloperAnalytics } from "@/lib/analytics/release";

try {
  const { dataThrough, figures, released } =
    await releaseDeveloperAnalytics(db);
  console.info(
    `Developer analytics through ${dataThrough}: ${figures} figures, ${released} released, ${figures - released} withheld.`,
  );
} finally {
  await dbClient.end({ timeout: 5 });
}
