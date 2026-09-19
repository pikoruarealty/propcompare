import { describe, expect, it } from "vitest";
import {
  emptyVariantForm,
  formToVariants,
  variantsToForm,
  type VariantForm,
} from "./variant-form";

const filled = (over: Partial<VariantForm> = {}): VariantForm => ({
  ...emptyVariantForm(),
  variantName: "3 BHK - A",
  ...over,
});

describe("formToVariants", () => {
  it("builds the canonical value, dropping everything left blank", () => {
    const result = formToVariants([
      filled({
        bhkTypeKey: "3bhk",
        totalUnitsOfVariant: "48",
        areas: [
          { basis: "carpet", areaSqft: "1450.5" },
          { basis: "super_built_up", areaSqft: "" },
        ],
      }),
    ]);
    expect(result).toEqual({
      ok: true,
      value: [
        {
          variantName: "3 BHK - A",
          bhkTypeKey: "3bhk",
          totalUnitsOfVariant: 48,
          areas: [{ basis: "carpet", areaSqft: 1450.5 }],
        },
      ],
    });
  });

  it("accepts a bare name: everything else is simply not stated", () => {
    expect(formToVariants([filled()])).toEqual({
      ok: true,
      value: [{ variantName: "3 BHK - A" }],
    });
  });

  it("requires at least one unit type and a name for each", () => {
    expect(formToVariants([])).toMatchObject({ ok: false });
    expect(formToVariants([filled({ variantName: "   " })])).toMatchObject({
      ok: false,
      error: expect.stringMatching(/needs a name/),
    });
  });

  it("refuses duplicate names regardless of case or spacing", () => {
    expect(
      formToVariants([filled(), filled({ variantName: " 3 bhk - a " })]),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/twice/) });
  });

  it.each([
    [{ totalUnitsOfVariant: "0" }, /total units/],
    [{ totalUnitsOfVariant: "2.5" }, /total units/],
    [{ unitsPerFloor: "-1" }, /units per floor/],
    [
      { areas: [{ basis: "carpet" as const, areaSqft: "abc" }] },
      /areas must be/,
    ],
    [{ areas: [{ basis: "carpet" as const, areaSqft: "0" }] }, /areas must be/],
    [
      { areas: [{ basis: "" as const, areaSqft: "900" }] },
      /what each area measures/,
    ],
    [
      {
        areas: [
          { basis: "carpet" as const, areaSqft: "900" },
          { basis: "carpet" as const, areaSqft: "950" },
        ],
      },
      /once/,
    ],
  ])("rejects bad input %#", (over, message) => {
    expect(formToVariants([filled(over)])).toMatchObject({
      ok: false,
      error: expect.stringMatching(message),
    });
  });

  it("carries dimensions through untouched", () => {
    const dimensions = {
      rooms: [{ name: "Living", lengthFt: 18, widthFt: 14 }],
    };
    const result = formToVariants([filled({ dimensions })]);
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.value[0].dimensions).toBe(dimensions);
  });
});

describe("variantsToForm", () => {
  it("round-trips a canonical value without loss", () => {
    const value = [
      {
        variantName: "2 BHK",
        bhkTypeKey: "2bhk",
        layoutTypeKey: "duplex",
        totalUnitsOfVariant: 24,
        unitsPerFloor: 2,
        areas: [{ basis: "carpet" as const, areaSqft: 900 }],
        dimensions: { rooms: [{ name: "Bedroom", areaSqft: 150 }] },
      },
    ];
    const back = formToVariants(variantsToForm(value));
    expect(back).toEqual({ ok: true, value });
  });

  it("copes with a missing or malformed value", () => {
    expect(variantsToForm(undefined)).toEqual([]);
    expect(variantsToForm("nope")).toEqual([]);
    expect(variantsToForm([null])).toHaveLength(1);
  });
});
