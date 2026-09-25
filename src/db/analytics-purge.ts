/**
 * Keeps raw analytics events to 13 months (`DECISIONS.md` 2026-09-25): rolls older
 * months into the monthly counts and deletes the raw rows. Safe to run as often as
 * you like; schedule it daily. `bun run analytics:purge`
 */
import { db, dbClient } from "./index";
import { purgeOldAnalytics } from "@/lib/analytics/retention";

try {
  const { cutoff, deleted } = await purgeOldAnalytics(db);
  console.info(
    `Analytics: ${deleted} raw events before ${cutoff} rolled up and deleted.`,
  );
} finally {
  await dbClient.end({ timeout: 5 });
}
