import { describe, expect, it } from "vitest";
import { fillDays, istDay } from "./days";

const day = (d: string, visitors = 0) => ({
  day: d,
  visitors,
  comparisons: 0,
  enquiries: 0,
});

describe("fillDays", () => {
  it("gives every day of the period, the quiet ones as zeros, in order", () => {
    const range = {
      from: new Date("2026-09-20T05:00:00Z"),
      to: new Date("2026-09-26T10:00:00Z"),
    };
    const filled = fillDays(
      [day("2026-09-26", 4), day("2026-09-22", 2)],
      range,
    );
    expect(filled.map((d) => d.day)).toEqual([
      "2026-09-20",
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
      "2026-09-25",
      "2026-09-26",
    ]);
    expect(filled.map((d) => d.visitors)).toEqual([0, 0, 2, 0, 0, 0, 4]);
  });

  it("counts a day by the Indian calendar, not UTC", () => {
    // 20:00 UTC is 01:30 the next day in India.
    expect(istDay(new Date("2026-09-25T20:00:00Z"))).toBe("2026-09-26");
    expect(istDay(new Date("2026-09-25T18:29:00Z"))).toBe("2026-09-25");
  });

  it("starts on the period's first Indian day and ends on its last", () => {
    const range = {
      from: new Date("2001-01-01T00:00:00Z"),
      to: new Date("2001-02-01T00:00:00Z"),
    };
    // Midnight UTC is 05:30 in India, so both ends fall on the same date there.
    const filled = fillDays([], range);
    expect(filled[0].day).toBe("2001-01-01");
    expect(filled.at(-1)?.day).toBe("2001-02-01");
  });
});
