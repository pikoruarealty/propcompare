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
  "app/admin/",
  "components/admin/",
  "app/api/v1/events/",
];

const READS =
  /@\/lib\/analytics\/(dashboard|record|retention)|@\/db\/schema\/analytics|analytics_events|analyticsEvents|analytics_(event|pair)_monthly/;

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
