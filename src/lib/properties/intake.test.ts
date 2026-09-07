import { describe, expect, it } from "vitest";
import {
  DEFAULT_STATED_RANGE,
  EMPTY_ANSWERS,
  HANDOFF_PARAMETER_NAMES,
  INTAKE_STEPS,
  type IntakeAnswers,
  MAX_PRIORITIES,
  PRIORITY_KEYS,
  PRIORITY_OPTIONS,
  QUESTION_STEP_COUNT,
  RANGE_MAX_LAKH,
  RANGE_MIN_LAKH,
  RANGE_STEP_LAKH,
  describePriorities,
  formatStatedFigure,
  formatStatedRange,
  handoffHref,
  handoffParams,
  hasAnyAnswer,
  rangePercent,
  stepIndexOf,
  togglePriority,
  withLowerEnd,
  withUpperEnd,
} from "./intake";
import { findForbiddenKeys } from "./no-price";
import { DEFAULT_PAGE_SIZE, DEFAULT_SORT } from "./types";

/**
 * The intake vocabulary, the stated-range arithmetic, and the hand-off URL.
 *
 * The hand-off assertions are the load-bearing ones: they are the guard that
 * the stated range and the priorities never reach an address bar, a server log,
 * or a `Referer` header.
 */

const answered: IntakeAnswers = {
  priorities: ["family_space", "possession_speed"],
  bhk: "3bhk",
  city: "Ahmedabad",
  statedRange: { fromLakh: 75, toLakh: 220 },
};

describe("priority vocabulary", () => {
  it("offers exactly the documented keys, each with a stated grounding", () => {
    expect(PRIORITY_OPTIONS.map((option) => option.key)).toEqual([
      ...PRIORITY_KEYS,
    ]);

    for (const option of PRIORITY_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
      // Every priority names the published fact class it reads. A priority the
      // catalog cannot answer would be a question asked in bad faith.
      expect(option.grounding).toMatch(/published|recorded/i);
    }
  });

  it("toggles a priority on and off", () => {
    expect(togglePriority([], "privacy")).toEqual(["privacy"]);
    expect(togglePriority(["privacy", "location"], "privacy")).toEqual([
      "location",
    ]);
  });

  it("keeps the buyer's earlier choices when the cap is reached", () => {
    const full = PRIORITY_KEYS.slice(0, MAX_PRIORITIES);
    const next = togglePriority(full, PRIORITY_KEYS[MAX_PRIORITIES]);

    // Selecting past the cap is a no-op, never a silent eviction: nothing the
    // buyer chose disappears without the buyer removing it.
    expect(next).toEqual([...full]);
  });

  it("describes priorities in the order they were chosen", () => {
    expect(describePriorities(["location", "family_space"])).toEqual([
      "The locality itself",
      "Room for a family",
    ]);
  });
});

describe("stated range", () => {
  it("steps coarsely and stays inside the scale", () => {
    expect(RANGE_STEP_LAKH).toBe(5);
    expect(withLowerEnd(DEFAULT_STATED_RANGE, 62).fromLakh).toBe(60);
    expect(withLowerEnd(DEFAULT_STATED_RANGE, -40).fromLakh).toBe(
      RANGE_MIN_LAKH,
    );
    expect(withUpperEnd(DEFAULT_STATED_RANGE, 9000).toLakh).toBe(
      RANGE_MAX_LAKH,
    );
  });

  it("clamps a handle at the other rather than pushing it along", () => {
    const range = { fromLakh: 50, toLakh: 150 };

    expect(withLowerEnd(range, 400)).toEqual({ fromLakh: 150, toLakh: 150 });
    expect(withUpperEnd(range, 10)).toEqual({ fromLakh: 50, toLakh: 50 });
  });

  it("places handles on the track proportionally", () => {
    expect(rangePercent(RANGE_MIN_LAKH)).toBe(0);
    expect(rangePercent(RANGE_MAX_LAKH)).toBe(100);
  });

  it("reads a figure back in the units a buyer states it in", () => {
    expect(formatStatedFigure(50)).toBe("₹50 lakh");
    expect(formatStatedFigure(100)).toBe("₹1 crore");
    expect(formatStatedFigure(250)).toBe("₹2.5 crore");
  });

  it("leaves the top of the scale open-ended", () => {
    // A slider that stopped flat at ₹5 crore would put a ceiling in the mouth
    // of a buyer whose range runs past it.
    expect(formatStatedRange({ fromLakh: 200, toLakh: RANGE_MAX_LAKH })).toBe(
      "₹2 crore to ₹5 crore or more",
    );
    expect(formatStatedRange({ fromLakh: 50, toLakh: 150 })).toBe(
      "₹50 lakh to ₹1.5 crore",
    );
  });
});

describe("answers", () => {
  it("starts empty and reports when anything has been stated", () => {
    expect(hasAnyAnswer(EMPTY_ANSWERS)).toBe(false);
    expect(hasAnyAnswer({ ...EMPTY_ANSWERS, city: "Ahmedabad" })).toBe(true);
    expect(
      hasAnyAnswer({ ...EMPTY_ANSWERS, statedRange: DEFAULT_STATED_RANGE }),
    ).toBe(true);
  });

  it("names the stated range so it cannot trip the production leak guard", () => {
    // `buyer_intake_sessions` calls these columns `budget_min_inr` and
    // `budget_max_inr`. Mirroring those names in client state would match
    // `findForbiddenKeys`'s `/inr/i` pattern, which runs in production — the
    // choice would then be between weakening that guard and carrying a shape
    // nothing can be handed. The names here avoid the trade entirely.
    expect(findForbiddenKeys(answered)).toEqual([]);
  });

  it("counts the summary out of the question tally", () => {
    expect(INTAKE_STEPS).toHaveLength(QUESTION_STEP_COUNT + 1);
    expect(INTAKE_STEPS[QUESTION_STEP_COUNT].id).toBe("summary");
    expect(stepIndexOf("range")).toBe(3);
  });
});

describe("hand-off to browse", () => {
  it("carries only the answers that map to real read-contract filters", () => {
    expect(handoffParams(answered)).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      sort: DEFAULT_SORT,
      city: "Ahmedabad",
      bhk: "3bhk",
    });
  });

  it("never puts the stated range or the priorities in the URL", () => {
    const href = handoffHref(answered);
    const search = new URL(href, "https://propcompare.test").searchParams;

    expect([...search.keys()].sort()).toEqual(
      [...HANDOFF_PARAMETER_NAMES].sort(),
    );

    // Named separately from the key check, because the failure this guards
    // against is a figure reaching browser history and the `Referer` header —
    // under any parameter name at all.
    for (const figure of ["75", "220", "budget", "range", "lakh", "crore"]) {
      expect(href.toLowerCase()).not.toContain(figure);
    }
    for (const priority of PRIORITY_KEYS) {
      expect(href).not.toContain(priority);
    }
  });

  it("opens the unfiltered catalog when nothing filterable was stated", () => {
    expect(
      handoffHref({ ...EMPTY_ANSWERS, statedRange: DEFAULT_STATED_RANGE }),
    ).toBe("/properties");
  });
});
