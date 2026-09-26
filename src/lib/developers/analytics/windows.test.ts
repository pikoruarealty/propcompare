import { describe, expect, it } from "vitest";
import {
  DEFAULT_REPORT_WINDOW,
  REPORT_WINDOW_KEYS,
  WINDOW_LABELS,
  parseReportWindow,
  windowCoverage,
} from "./windows";

describe("developer report windows", () => {
  it("knows exactly the five windows the release job writes", () => {
    expect([...REPORT_WINDOW_KEYS]).toEqual(["7d", "30d", "qtd", "ytd", "12m"]);
    expect(Object.keys(WINDOW_LABELS).sort()).toEqual(
      [...REPORT_WINDOW_KEYS].sort(),
    );
    expect(REPORT_WINDOW_KEYS).toContain(DEFAULT_REPORT_WINDOW);
  });

  it("accepts only those keys", () => {
    expect(parseReportWindow("ytd")).toBe("ytd");
    for (const bad of ["", "13m", "90d", "custom", "30D", null, undefined]) {
      expect(parseReportWindow(bad)).toBeNull();
    }
  });

  describe("coverage by when tracking began", () => {
    const window = { start: "2026-09-01", end: "2026-09-30" };

    it("is none before any event was recorded", () => {
      expect(windowCoverage(null, window)).toBe("none");
    });

    it("is none when tracking began after the window", () => {
      // 30 September 20:00 UTC is 1 October in India.
      expect(windowCoverage(new Date("2026-09-30T20:00:00Z"), window)).toBe(
        "none",
      );
    });

    it("is partial when tracking began inside the window", () => {
      expect(windowCoverage(new Date("2026-09-10T06:00:00Z"), window)).toBe(
        "partial",
      );
    });

    it("is full when tracking began on or before the first day, in India time", () => {
      // 31 August 20:00 UTC is 1 September 01:30 in India: the first day.
      expect(windowCoverage(new Date("2026-08-31T20:00:00Z"), window)).toBe(
        "full",
      );
      expect(windowCoverage(new Date("2026-01-01T00:00:00Z"), window)).toBe(
        "full",
      );
    });
  });
});
