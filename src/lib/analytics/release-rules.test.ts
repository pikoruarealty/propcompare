import { describe, expect, it } from "vitest";
import {
  MIN_VISITORS,
  lastCompleteDay,
  meetsGate,
  releaseCell,
  releaseGroup,
  reportWindows,
  reportingDayOf,
  windowBounds,
  type WindowKey,
} from "./release-rules";
import { RELEASE_BUDGET_BANDS } from "@/db/schema/developer-analytics";
import { BUDGET_BANDS } from "./events";
import { RAW_RETENTION_MONTHS } from "./retention";

describe("the released table's budget bands", () => {
  it("are exactly the bands events carry", () => {
    expect([...RELEASE_BUDGET_BANDS]).toEqual([...BUDGET_BANDS]);
  });
});

const windowsOf = (end: string) =>
  Object.fromEntries(
    reportWindows(end).map((window) => [
      window.key,
      [window.start, window.end],
    ]),
  ) as Record<WindowKey, [string, string]>;

describe("reporting days", () => {
  it("reads the day in India time, not UTC", () => {
    expect(reportingDayOf(new Date("2026-09-25T18:29:59Z"))).toBe("2026-09-25");
    expect(reportingDayOf(new Date("2026-09-25T18:30:00Z"))).toBe("2026-09-26");
  });

  it("reports through the last whole India-time day", () => {
    expect(lastCompleteDay(new Date("2026-09-25T18:29:59Z"))).toBe(
      "2026-09-24",
    );
    expect(lastCompleteDay(new Date("2026-09-25T18:30:00Z"))).toBe(
      "2026-09-25",
    );
    expect(lastCompleteDay(new Date("2026-01-01T02:00:00Z"))).toBe(
      "2025-12-31",
    );
  });
});

describe("reportWindows", () => {
  it("gives the five fixed windows, calendar quarter and year", () => {
    expect(windowsOf("2026-09-25")).toEqual({
      "7d": ["2026-09-19", "2026-09-25"],
      "30d": ["2026-08-27", "2026-09-25"],
      qtd: ["2026-07-01", "2026-09-25"],
      ytd: ["2026-01-01", "2026-09-25"],
      "12m": ["2025-09-26", "2026-09-25"],
    });
  });

  it("starts a quarter and a year on their own first day", () => {
    expect(windowsOf("2026-10-01").qtd).toEqual(["2026-10-01", "2026-10-01"]);
    expect(windowsOf("2026-01-01").ytd).toEqual(["2026-01-01", "2026-01-01"]);
    expect(windowsOf("2026-01-01").qtd).toEqual(["2026-01-01", "2026-01-01"]);
  });

  it("crosses a year for the trailing windows", () => {
    expect(windowsOf("2026-01-05")["30d"]).toEqual([
      "2025-12-07",
      "2026-01-05",
    ]);
  });

  it("clamps twelve months back to a shorter month's last day", () => {
    expect(windowsOf("2028-02-29")["12m"]).toEqual([
      "2027-03-01",
      "2028-02-29",
    ]);
    expect(windowsOf("2026-03-31")["12m"]).toEqual([
      "2025-04-01",
      "2026-03-31",
    ]);
  });

  it("refuses something that is not a calendar day", () => {
    expect(() => reportWindows("2026-02-30")).toThrow();
    expect(() => reportWindows("26-9-25")).toThrow();
  });
});

describe("windowBounds", () => {
  it("runs from India-time midnight to the next India-time midnight", () => {
    expect(windowBounds({ start: "2026-09-25", end: "2026-09-25" })).toEqual({
      from: new Date("2026-09-24T18:30:00Z"),
      until: new Date("2026-09-25T18:30:00Z"),
    });
  });

  /**
   * The retention job (`purgeOldAnalytics`) keeps raw events from the first UTC
   * day of the month `RAW_RETENTION_MONTHS` before the current one. Every window
   * a run can report must start at or after that, at any hour of any day, or it
   * would silently count fewer visitors than were there.
   */
  it("never reaches raw events the retention job has already removed", () => {
    const start = Date.UTC(2026, 0, 1);
    for (let hour = 0; hour < 24 * 366 * 2; hour += 1) {
      const now = new Date(start + hour * 3_600_000);
      const cutoff = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth() - RAW_RETENTION_MONTHS,
          1,
        ),
      );
      for (const window of reportWindows(lastCompleteDay(now))) {
        expect(windowBounds(window).from.getTime()).toBeGreaterThanOrEqual(
          cutoff.getTime(),
        );
      }
    }
  });
});

describe("the visitor gate", () => {
  it(`releases a figure from ${MIN_VISITORS} distinct visitors, not before`, () => {
    expect(MIN_VISITORS).toBe(5);
    expect(meetsGate(4)).toBe(false);
    expect(meetsGate(5)).toBe(true);
    expect(releaseCell({ key: null, visitors: 4, value: 4 })).toEqual({
      key: null,
      released: false,
      value: null,
    });
    expect(releaseCell({ key: null, visitors: 5, value: 5 })).toEqual({
      key: null,
      released: true,
      value: 5,
    });
  });

  it("gates visits on visitors, so one person visiting often releases nothing", () => {
    expect(releaseCell({ key: null, visitors: 1, value: 12 })).toMatchObject({
      released: false,
      value: null,
    });
  });

  it("never turns a withheld figure into a zero", () => {
    expect(releaseCell({ key: null, visitors: 0, value: 0 }).value).toBeNull();
  });

  it("refuses a visitor count that is not a whole number", () => {
    expect(() => meetsGate(4.5)).toThrow();
    expect(() => meetsGate(-1)).toThrow();
  });
});

describe("releaseGroup", () => {
  it("withholds the smallest shown split when exactly one is withheld", () => {
    expect(
      releaseGroup([
        { key: "mobile", visitors: 20, value: 20 },
        { key: "desktop", visitors: 7, value: 7 },
        { key: "tablet", visitors: 2, value: 2 },
      ]),
    ).toEqual([
      { key: "mobile", released: true, value: 20 },
      { key: "desktop", released: false, value: null },
      { key: "tablet", released: false, value: null },
    ]);
  });

  it("leaves a group alone when none or several are already withheld", () => {
    const allShown = releaseGroup([
      { key: "a", visitors: 5, value: 5 },
      { key: "b", visitors: 9, value: 9 },
    ]);
    expect(allShown.every((cell) => cell.released)).toBe(true);

    const twoWithheld = releaseGroup([
      { key: "a", visitors: 1, value: 1 },
      { key: "b", visitors: 2, value: 2 },
      { key: "c", visitors: 30, value: 30 },
    ]);
    expect(twoWithheld.map((cell) => cell.released)).toEqual([
      false,
      false,
      true,
    ]);
  });

  it("chooses the same partner on every run when splits tie", () => {
    const cells = [
      { key: "₹1–1.5 crore", visitors: 6, value: 6 },
      { key: "₹50–75 lakh", visitors: 6, value: 6 },
      { key: "Up to ₹50 lakh", visitors: 1, value: 1 },
    ];
    const first = releaseGroup(cells);
    const reversed = releaseGroup([...cells].reverse());
    const withheld = (result: ReturnType<typeof releaseGroup>) =>
      result.filter((cell) => !cell.released).map((cell) => cell.key);
    expect(withheld(first).sort()).toEqual(withheld(reversed).sort());
    expect(withheld(first)).toHaveLength(2);
  });

  it("does nothing more for a single withheld figure with no siblings", () => {
    expect(releaseGroup([{ key: null, visitors: 3, value: 3 }])).toEqual([
      { key: null, released: false, value: null },
    ]);
  });

  it("refuses a group with a repeated split", () => {
    expect(() =>
      releaseGroup([
        { key: "mobile", visitors: 5, value: 5 },
        { key: "mobile", visitors: 6, value: 6 },
      ]),
    ).toThrow();
  });
});
