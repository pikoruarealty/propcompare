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

describe("a unit type's own amenities in the form", () => {
  it("carries a recorded list through the form unchanged", () => {
    const value = [
      {
        variantName: "Penthouse",
        amenities: [
          { key: "jacuzzi", status: "available" as const },
          { key: "sauna", status: "explicitly_not_offered" as const },
        ],
      },
    ];
    expect(formToVariants(variantsToForm(value))).toEqual({ ok: true, value });
  });

  it("writes no list for a unit type that never had one, so the live ones stay", () => {
    const [form] = variantsToForm([{ variantName: "2 BHK" }]);
    expect(form.amenities).toBeNull();
    expect(formToVariants([form])).toEqual({
      ok: true,
      value: [{ variantName: "2 BHK" }],
    });
  });

  it("writes an empty list when the last one is taken off: none is the answer", () => {
    expect(formToVariants([filled({ amenities: [] })])).toEqual({
      ok: true,
      value: [{ variantName: "3 BHK - A", amenities: [] }],
    });
  });
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

  it("writes the rooms, balconies and foyer the form shows, as numbers", () => {
    const result = formToVariants([
      filled({
        rooms: [
          { name: " Living ", lengthFt: "18", widthFt: "14.5", areaSqft: "" },
          { name: "Bedroom", lengthFt: "", widthFt: "", areaSqft: "150" },
        ],
        balconies: [
          { name: "Balcony", lengthFt: "10", widthFt: "4", areaSqft: "" },
        ],
        foyer: { name: "Foyer", lengthFt: "6", widthFt: "5", areaSqft: "" },
      }),
    ]);

    expect(result).toEqual({
      ok: true,
      value: [
        {
          variantName: "3 BHK - A",
          dimensions: {
            rooms: [
              { name: "Living", lengthFt: 18, widthFt: 14.5 },
              { name: "Bedroom", areaSqft: 150 },
            ],
            balconies: [{ name: "Balcony", lengthFt: 10, widthFt: 4 }],
            foyer: { name: "Foyer", lengthFt: 6, widthFt: 5 },
          },
        },
      ],
    });
  });

  it("leaves dimensions out entirely when there are no rooms, and skips blank rows", () => {
    const result = formToVariants([
      filled({
        rooms: [{ name: "", lengthFt: "", widthFt: "", areaSqft: "" }],
        foyer: { name: "", lengthFt: "", widthFt: "", areaSqft: "" },
      }),
    ]);

    expect(result).toEqual({ ok: true, value: [{ variantName: "3 BHK - A" }] });
  });

  it("lets a room be removed: what is not in the form is not written", () => {
    const before = variantsToForm([
      {
        variantName: "A",
        dimensions: {
          rooms: [
            { name: "Living", lengthFt: 16, widthFt: 12 },
            { name: "Study", lengthFt: 10, widthFt: 9 },
          ],
        },
      },
    ]);
    before[0].rooms = before[0].rooms.filter((room) => room.name !== "Study");

    expect(formToVariants(before)).toEqual({
      ok: true,
      value: [
        {
          variantName: "A",
          dimensions: {
            rooms: [{ name: "Living", lengthFt: 16, widthFt: 12 }],
          },
        },
      ],
    });
  });

  it.each([
    [
      { rooms: [{ name: "", lengthFt: "10", widthFt: "10", areaSqft: "" }] },
      /give each room a name/,
    ],
    [
      { rooms: [{ name: "Living", lengthFt: "", widthFt: "", areaSqft: "" }] },
      /needs a length and width, or an area/,
    ],
    [
      {
        rooms: [
          { name: "Living", lengthFt: "abc", widthFt: "10", areaSqft: "" },
        ],
      },
      /length of Living must be a number above zero/,
    ],
    [
      {
        balconies: [{ name: "B", lengthFt: "-2", widthFt: "4", areaSqft: "" }],
      },
      /length of B must be a number above zero/,
    ],
    [
      { foyer: { name: "Foyer", lengthFt: "0", widthFt: "5", areaSqft: "" } },
      /length of Foyer must be a number above zero/,
    ],
  ])("rejects a bad room, in plain words (%#)", (over, message) => {
    expect(
      formToVariants([filled(over as Partial<VariantForm>)]),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(message),
    });
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

  it("round-trips rooms, balconies and a foyer, including repeated names", () => {
    const value = [
      {
        variantName: "Block A - Typical",
        dimensions: {
          rooms: [
            { name: "Bedroom", lengthFt: 12, widthFt: 11 },
            { name: "Bedroom", lengthFt: 11, widthFt: 10 },
            { name: "Duct", areaSqft: 6 },
          ],
          balconies: [{ name: "Balcony", lengthFt: 10, widthFt: 4.5 }],
          foyer: { name: "Foyer", lengthFt: 6, widthFt: 5 },
        },
      },
    ];

    expect(formToVariants(variantsToForm(value))).toEqual({ ok: true, value });
  });

  it("shows every stored room in the form", () => {
    const [form] = variantsToForm([
      {
        variantName: "A",
        dimensions: {
          rooms: [{ name: "Living", lengthFt: 16.5, widthFt: 12 }],
        },
      },
    ]);

    expect(form.rooms).toEqual([
      { name: "Living", lengthFt: "16.5", widthFt: "12", areaSqft: "" },
    ]);
    expect(form.balconies).toEqual([]);
    expect(form.foyer).toBeNull();
  });

  it("copes with a missing or malformed value", () => {
    expect(variantsToForm(undefined)).toEqual([]);
    expect(variantsToForm("nope")).toEqual([]);
    expect(variantsToForm([null])).toHaveLength(1);
  });
});
