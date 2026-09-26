import { describe, expect, it } from "vitest";
import {
  MAX_RIVALS,
  MIN_COHORT_DEVELOPERS,
  MIN_COHORT_PROPERTIES,
  MIN_VISITORS,
  lastCompleteDay,
  meetsGate,
  releaseBenchmark,
  releaseCell,
  releaseGroup,
  releasePairings,
  reportWindows,
  reportingDayOf,
  windowBounds,
  type BenchmarkProperty,
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

  it("keeps the gate on identified visitors even when the value counts more (anonymous activity, 2026-09-26)", () => {
    // `visitors` is always the identified count; `value` may be larger once a
    // metric also counts events with no visitor id (a privacy signal, or older
    // than the raw retention window). A few identified people plus a lot of
    // anonymous activity still does not meet the gate.
    expect(releaseCell({ key: null, visitors: 3, value: 60 })).toMatchObject({
      released: false,
      value: null,
    });
    // Once enough identified people are behind it, the larger value (which may
    // include anonymous activity) is what is shown, not the identified count.
    expect(releaseCell({ key: null, visitors: 5, value: 60 })).toEqual({
      key: null,
      released: true,
      value: 60,
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

describe("named rival pairings", () => {
  const pair = (
    propertyId: string,
    rivalPropertyId: string,
    visitors: number,
  ) => ({
    propertyId,
    rivalPropertyId,
    visitors,
  });

  it("releases a pairing at the gate and not below it", () => {
    expect(
      releasePairings([
        pair("a", "b", 5),
        pair("a", "c", 4),
        pair("a", "d", 0),
      ]),
    ).toEqual([pair("a", "b", 5)]);
  });

  it("never pairs a property with itself", () => {
    expect(releasePairings([pair("a", "a", 50)])).toEqual([]);
  });

  it("keeps the most compared rivals per property, ties broken by id", () => {
    const rivals = Array.from({ length: MAX_RIVALS + 3 }, (_, index) =>
      pair("a", `r${index}`, index < 2 ? 20 : 6),
    );
    const kept = releasePairings([...rivals].reverse());
    expect(kept).toHaveLength(MAX_RIVALS);
    expect(kept.map((row) => row.rivalPropertyId)).toEqual([
      "r0",
      "r1",
      "r2",
      "r3",
      "r4",
    ]);
  });

  it("caps each property on its own", () => {
    const kept = releasePairings([
      ...Array.from({ length: MAX_RIVALS + 2 }, (_, i) =>
        pair("a", `x${i}`, 9),
      ),
      pair("b", "y", 9),
    ]);
    expect(kept.filter((row) => row.propertyId === "b")).toHaveLength(1);
    expect(kept.filter((row) => row.propertyId === "a")).toHaveLength(
      MAX_RIVALS,
    );
  });
});

describe("peer benchmarks", () => {
  const property = (
    id: string,
    developerId: string,
    value: number,
    locality = "Satellite",
    city = "Ahmedabad",
  ): BenchmarkProperty => ({
    propertyId: id,
    developerId,
    city,
    locality,
    value,
  });

  const subject = property("me", "mine", 40);

  it("needs enough properties from enough other developers", () => {
    const enough = [
      property("p1", "d1", 8),
      property("p2", "d1", 6),
      property("p3", "d2", 10),
      property("p4", "d2", 12),
      property("p5", "d3", 7),
    ];
    expect(MIN_COHORT_PROPERTIES).toBe(5);
    expect(MIN_COHORT_DEVELOPERS).toBe(3);
    expect(releaseBenchmark(subject, [subject, ...enough])).toEqual({
      cohort: "locality",
      properties: 5,
      developers: 3,
      median: 8,
    });
    // One property too few.
    expect(releaseBenchmark(subject, [subject, ...enough.slice(1)])).toBeNull();
    // Enough properties but only two developers.
    expect(
      releaseBenchmark(subject, [
        subject,
        ...enough.map((p) => ({
          ...p,
          developerId: p.developerId === "d3" ? "d2" : p.developerId,
        })),
      ]),
    ).toBeNull();
  });

  it("leaves out the developer's own properties and the subject", () => {
    const own = [
      property("mine2", "mine", 900),
      property("mine3", "mine", 900),
    ];
    const others = ["d1", "d2", "d3", "d4", "d5"].map((d, i) =>
      property(`p${i}`, d, 10),
    );
    expect(
      releaseBenchmark(subject, [subject, ...own, ...others]),
    ).toMatchObject({
      properties: 5,
      median: 10,
    });
  });

  it("falls to the city when the locality is too small, and stops there", () => {
    const elsewhere = ["d1", "d2", "d3", "d4", "d5"].map((d, i) =>
      property(`p${i}`, d, 9, `Locality ${i}`),
    );
    expect(releaseBenchmark(subject, [subject, ...elsewhere])).toMatchObject({
      cohort: "city",
      properties: 5,
      developers: 5,
      median: 9,
    });
    // Another city is not a cohort.
    const abroad = elsewhere.map((p) => ({ ...p, city: "Surat" }));
    expect(releaseBenchmark(subject, [subject, ...abroad])).toBeNull();
  });

  it("uses the narrowest cohort that is large enough, without falling back past a low median", () => {
    const locality = ["d1", "d2", "d3", "d4", "d5"].map((d, i) =>
      property(`l${i}`, d, 2),
    );
    const city = ["d1", "d2", "d3", "d4", "d5"].map((d, i) =>
      property(`c${i}`, d, 100, `Elsewhere ${i}`),
    );
    // The locality is large enough but its median (2) is under the gate: withheld,
    // not swapped for the city's 51.
    expect(
      releaseBenchmark(subject, [subject, ...locality, ...city]),
    ).toBeNull();
  });

  it("withholds a median under the visitor gate, and counts a property with nothing as zero", () => {
    const quiet = ["d1", "d2", "d3", "d4", "d5"].map((d, i) =>
      property(`p${i}`, d, i < 3 ? 0 : 20),
    );
    expect(releaseBenchmark(subject, [subject, ...quiet])).toBeNull();
    const busier = ["d1", "d2", "d3", "d4", "d5"].map((d, i) =>
      property(`p${i}`, d, i < 2 ? 0 : 20),
    );
    expect(releaseBenchmark(subject, [subject, ...busier])?.median).toBe(20);
  });

  it("averages the two middle values of an even cohort", () => {
    const six = [4, 5, 6, 7, 8, 9].map((v, i) => property(`p${i}`, `d${i}`, v));
    expect(releaseBenchmark(subject, [subject, ...six])?.median).toBe(6.5);
  });

  it("matches place names without regard to case or spacing", () => {
    const others = ["d1", "d2", "d3", "d4", "d5"].map((d, i) =>
      property(`p${i}`, d, 12, " satellite ", "AHMEDABAD"),
    );
    expect(releaseBenchmark(subject, [subject, ...others])?.cohort).toBe(
      "locality",
    );
  });
});
