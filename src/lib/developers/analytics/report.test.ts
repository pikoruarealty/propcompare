import { describe, expect, it } from "vitest";
import { FIGURE_LABELS } from "./metrics";
import { propertyFigures, propertySplits } from "./report";

const P = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

const row = (
  metric: string,
  released: boolean,
  value: number | null,
  extra: {
    propertyId?: string | null;
    dimension?: string;
    dimensionValue?: string | null;
  } = {},
) => ({
  propertyId: P as string | null,
  metric,
  dimension: "none",
  dimensionValue: null as string | null,
  released,
  value,
  ...extra,
});

describe("developer report shaping", () => {
  it("gives every figure, withheld when it has no row", () => {
    const figures = propertyFigures([row("visitors", true, 12)], P);
    expect(Object.keys(figures).sort()).toEqual(
      Object.keys(FIGURE_LABELS).sort(),
    );
    expect(figures.visitors).toEqual({ released: true, value: 12 });
    expect(figures.savers).toEqual({ released: false, value: null });
  });

  it("never turns a withheld figure into a zero", () => {
    const figures = propertyFigures([row("savers", false, null)], P);
    expect(figures.savers).toEqual({ released: false, value: null });
  });

  it("refuses a released row with no number, and a number that is not released", () => {
    const figures = propertyFigures([row("visits", false, 9)], P);
    expect(figures.visits).toEqual({ released: false, value: null });
  });

  it("reads only the property asked for", () => {
    const figures = propertyFigures(
      [row("visitors", true, 99, { propertyId: OTHER })],
      P,
    );
    expect(figures.visitors.released).toBe(false);
  });

  it("lists counted splits in a fixed order and skips missing ones", () => {
    const splits = propertySplits(
      [
        row("visitors", true, 6, {
          dimension: "device",
          dimensionValue: "desktop",
        }),
        row("visitors", true, 9, {
          dimension: "device",
          dimensionValue: "mobile",
        }),
        row("visitors", false, null, {
          dimension: "budget_band",
          dimensionValue: "₹1–1.5 crore",
        }),
        row("savers", true, 8, {
          dimension: "device",
          dimensionValue: "mobile",
        }),
      ],
      P,
    );
    expect(splits).toEqual([
      {
        figure: "visitors",
        dimension: "budget_band",
        cells: [
          { key: "₹1–1.5 crore", figure: { released: false, value: null } },
        ],
      },
      {
        figure: "visitors",
        dimension: "device",
        cells: [
          { key: "mobile", figure: { released: true, value: 9 } },
          { key: "desktop", figure: { released: true, value: 6 } },
        ],
      },
    ]);
  });
});
