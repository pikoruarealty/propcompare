import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * What analytics reads is admin-only (`DECISIONS.md` 2026-09-25): no buyer or
 * developer surface may show a count, a pairing or a "most compared", and the
 * data must never become a score of a property. Buyer code may only send events
 * (`track`, `use-tracking`, `events`); reading them is for the admin console, the
 * retention job and the recorder.
 */
const root = path.resolve(__dirname, "../..");

const ALLOWED = [
  "lib/analytics/",
  "db/schema/analytics.ts",
  "db/analytics-purge.ts",
  // The release job reads raw events and writes only thresholded aggregates to
  // the v21 released tables, which is the one path developer code may read
  // (`DECISIONS.md` 2026-09-26). It runs from the command line, not a surface.
  "db/analytics-release.ts",
  "app/admin/",
  "components/admin/",
  "app/api/v1/events/",
];

/**
 * What buyer code may import from `lib/analytics`: sending an event, and the
 * pure helpers that carry no figure. Everything else in that directory reads
 * events, so it is listed here rather than in `READS` — a module added later is
 * guarded by default instead of only when someone remembers to add it (the
 * visitor journeys of 2026-09-26 were not, until this test was made fail-safe).
 */
const SEND_ONLY = ["track", "use-tracking", "events", "cookies", "format"];

const READS = new RegExp(
  [
    `@/lib/analytics/(?!(?:${SEND_ONLY.join("|")})\\b)[a-z-]+`,
    "@/db/schema/analytics",
    "analytics_events",
    "analyticsEvents",
    "analytics_(event|pair)_monthly",
  ].join("|"),
);

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });

describe("analytics isolation", () => {
  it("is read only by the admin console, the recorder and the retention job", () => {
    const offenders = walk(root)
      .map((file) => path.relative(root, file).replaceAll("\\", "/"))
      .filter((file) => !/\.test\.tsx?$/.test(file))
      .filter((file) => !ALLOWED.some((allowed) => file.startsWith(allowed)))
      .filter((file) =>
        READS.test(readFileSync(path.join(root, file), "utf8")),
      );
    expect(offenders).toEqual([]);
  });
});
