import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `drizzle-kit migrate` applies a migration only when its journal `when` is later
 * than the newest one already recorded in the database. `db:generate` stamps the
 * real clock, so a migration generated on a machine whose clock is earlier than a
 * neighbour's (or after hand-stamped ones) would be skipped, silently, on every
 * database that already has the neighbour, while still passing on a fresh one.
 * That happened to `0025` to `0027` and to `0029` (`DECISIONS.md` 2026-09-26), so
 * the order is checked here rather than found again on someone's database.
 *
 * `0015` was stamped earlier than `0014` before this check existed; the databases
 * that matter have long passed it, so the check begins after it.
 */
const FIRST_CHECKED_IDX = 16;

const journal = JSON.parse(
  readFileSync(
    path.resolve(__dirname, "../../drizzle/meta/_journal.json"),
    "utf8",
  ),
) as { entries: { idx: number; when: number; tag: string }[] };

describe("the migration journal", () => {
  it("numbers its entries in order, one per migration", () => {
    journal.entries.forEach((entry, index) => {
      expect(entry.idx).toBe(index);
      expect(entry.tag.startsWith(String(index).padStart(4, "0"))).toBe(true);
    });
  });

  it("stamps each later migration after the one before it", () => {
    const late = journal.entries.filter(
      (entry) => entry.idx >= FIRST_CHECKED_IDX,
    );
    for (const entry of late) {
      const before = journal.entries[entry.idx - 1];
      expect(
        entry.when,
        `${entry.tag} must be stamped after ${before.tag}, or an existing database will skip it`,
      ).toBeGreaterThan(before.when);
    }
  });
});
