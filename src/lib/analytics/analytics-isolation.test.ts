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

const sourceFiles = () =>
  walk(root)
    .map((file) => path.relative(root, file).replaceAll("\\", "/"))
    .filter((file) => !/\.test\.tsx?$/.test(file));

/**
 * Developer analytics (schema v21, `DECISIONS.md` 2026-09-26) reads only the
 * released tables, through the read-only reader connection. Its modules live
 * outside `lib/analytics/`, so the rule above already guards them like any other
 * non-admin code: they may not import raw-event modules or the v20 schema. The
 * reader connection is then kept to the developer analytics code, so nothing else
 * can borrow a role that may select every developer's released rows.
 */
const READER_USERS = [
  "db/developer-reader",
  "lib/developers/analytics/",
  "app/api/v1/developer/",
  "app/developers/",
];

describe("developer analytics isolation", () => {
  it("catches a raw event read planted in developer code", () => {
    for (const planted of [
      'import { analyticsEvents } from "@/db/schema/analytics";',
      'import { visitorJourney } from "@/lib/analytics/visitors";',
      'import { windowBounds } from "@/lib/analytics/release-rules";',
      "select count(*) from analytics_events",
      "select * from analytics_event_monthly",
      "select * from analytics_pair_monthly",
    ]) {
      expect(READS.test(planted), planted).toBe(true);
    }
  });

  it("lets developer code read the released tables and its own reader", () => {
    for (const fine of [
      'import { developerAnalyticsReleased } from "@/db/schema/developer-analytics";',
      'import { developerReaderDb } from "@/db/developer-reader";',
      'import { toCsv } from "@/lib/developers/analytics/csv";',
      'import { formatCount } from "@/lib/analytics/format";',
    ]) {
      expect(READS.test(fine), fine).toBe(false);
    }
  });

  it("keeps developer analytics code off raw events", () => {
    const offenders = sourceFiles()
      .filter((file) =>
        READER_USERS.slice(1).some((dir) => file.startsWith(dir)),
      )
      .filter((file) =>
        READS.test(readFileSync(path.join(root, file), "utf8")),
      );
    expect(offenders).toEqual([]);
  });

  it("uses the developer reader connection only from developer analytics", () => {
    const offenders = sourceFiles()
      .filter(
        (file) => !READER_USERS.some((allowed) => file.startsWith(allowed)),
      )
      .filter((file) =>
        readFileSync(path.join(root, file), "utf8").includes(
          "@/db/developer-reader",
        ),
      );
    expect(offenders).toEqual([]);
  });
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
