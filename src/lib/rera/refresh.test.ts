import { describe, expect, it } from "vitest";
import {
  FAILED_RETRY_MS,
  isDue,
  latestClosedQuarter,
  showsFilingFor,
  STALE_RUNNING_MS,
  UNFILED_RETRY_MS,
} from "./refresh";
import type { RegulatorRecord } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

const recordWithQuarter = (
  periodEndsOn: string,
  submittedOn: string | null,
): RegulatorRecord =>
  ({
    details: { version: 1 },
    latestQuarter: {
      name: "Q",
      periodEndsOn,
      dueOn: periodEndsOn,
      submittedOn,
      status: "SUBMITTED",
    },
  }) as unknown as RegulatorRecord;

describe("the latest closed quarter", () => {
  it.each([
    ["2026-01-03", "2025-09-30"], // the window for 31 December is still open
    ["2026-01-09", "2025-12-31"],
    ["2026-04-07", "2025-12-31"],
    ["2026-04-09", "2026-03-31"],
    ["2026-07-20", "2026-06-30"],
    ["2026-10-20", "2026-09-30"],
    ["2026-12-31", "2026-09-30"],
  ])("on %s it is the quarter ending %s", (today, expected) => {
    expect(latestClosedQuarter(at(today)).periodEnd).toBe(expected);
  });
});

describe("showsFilingFor", () => {
  it("needs a filed quarter that ends on or after the closed one", () => {
    expect(
      showsFilingFor(
        recordWithQuarter("2026-06-30", "2026-07-03"),
        "2026-06-30",
      ),
    ).toBe(true);
    expect(
      showsFilingFor(
        recordWithQuarter("2026-03-31", "2026-04-04"),
        "2026-06-30",
      ),
    ).toBe(false);
    expect(
      showsFilingFor(recordWithQuarter("2026-06-30", null), "2026-06-30"),
    ).toBe(false);
    expect(showsFilingFor(null, "2026-06-30")).toBe(false);
  });
});

describe("when a property is due", () => {
  const filedFor = (periodEnd: string) =>
    recordWithQuarter(periodEnd, "2026-01-01");

  it("is due when it has never been checked", () => {
    expect(isDue([], at("2026-09-20"))).toBe(true);
  });

  it("is not due when the last good record already shows the closed quarter's filing", () => {
    const now = at("2026-09-20");
    expect(
      isDue(
        [
          {
            status: "succeeded",
            at: new Date(now.getTime() - 30 * DAY),
            record: filedFor("2026-06-30"),
          },
        ],
        now,
      ),
    ).toBe(false);
  });

  it("becomes due once the next quarter's window has closed with no new filing", () => {
    const job = {
      status: "succeeded" as const,
      at: at("2026-09-20"),
      record: filedFor("2026-06-30"),
    };
    // The 30 September quarter's window is 1-7 October.
    expect(isDue([job], at("2026-10-07"))).toBe(false);
    expect(isDue([job], at("2026-10-20"))).toBe(true);
  });

  it("re-checks an unfiled quarter weekly, not daily", () => {
    const now = at("2026-11-01");
    const unfiled = (daysAgo: number) => ({
      status: "succeeded" as const,
      at: new Date(now.getTime() - daysAgo * DAY),
      record: filedFor("2026-06-30"),
    });
    expect(isDue([unfiled(2)], now)).toBe(false);
    expect(isDue([unfiled(UNFILED_RETRY_MS / DAY)], now)).toBe(true);
  });

  it("backs off after consecutive failures, capped at a week", () => {
    const now = at("2026-11-01");
    const failure = (hoursAgo: number) => ({
      status: "failed" as const,
      at: new Date(now.getTime() - hoursAgo * 60 * 60 * 1000),
      record: null,
    });
    // One failure: retry after a day.
    expect(isDue([failure(12)], now)).toBe(false);
    expect(isDue([failure(FAILED_RETRY_MS / 3_600_000)], now)).toBe(true);
    // Three in a row: four days.
    expect(isDue([failure(50), failure(80), failure(100)], now)).toBe(false);
    expect(isDue([failure(100), failure(150), failure(200)], now)).toBe(true);
    // Many in a row: never longer than a week.
    const many = Array.from({ length: 10 }, (_, i) => failure(170 + i));
    expect(isDue(many, now)).toBe(true);
    expect(isDue([failure(160), ...many.slice(1)], now)).toBe(false);
  });

  it("does not start a second check while one is running, but recovers a stale one", () => {
    const now = at("2026-11-01");
    const running = (msAgo: number) => ({
      status: "running" as const,
      at: new Date(now.getTime() - msAgo),
      record: null,
    });
    expect(isDue([running(60_000)], now)).toBe(false);
    expect(isDue([running(STALE_RUNNING_MS + 1)], now)).toBe(true);
  });
});
