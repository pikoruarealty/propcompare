/**
 * Anonymises raw analytics events older than 13 months (`DECISIONS.md` 2026-09-26): adds
 * their months to the monthly counts, then clears the visitor and visit ids. The
 * events themselves are kept. Safe to run as often as you like; schedule it daily.
 * `bun run analytics:purge`
 */
import { db, dbClient } from "./index";
import { purgeOldAnalytics } from "@/lib/analytics/retention";

try {
  const { cutoff, anonymised } = await purgeOldAnalytics(db);
  console.info(
    `Analytics: ${anonymised} events before ${cutoff} counted and anonymised.`,
  );
} finally {
  await dbClient.end({ timeout: 5 });
}
