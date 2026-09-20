import { describe, expect, it } from "vitest";
import {
  blockNamedIn,
  blockOfFlat,
  compareCarpetAreas,
  groupCarpetAreas,
  groupSqft,
  roomsTotalSqft,
} from "./carpet-area";
import type { RegulatorCarpetGroup } from "./types";

/** Kimana's four RERA carpet areas (square metres), as the adapter reduces them. */
const KIMANA: RegulatorCarpetGroup[] = [
  {
    block: "A",
    carpetAreaSqm: 369.54,
    flatCount: 36,
    firstFlat: "A-301",
    lastFlat: "A-2002",
  },
  {
    block: "A",
    carpetAreaSqm: 572.59,
    flatCount: 2,
    firstFlat: "A-2101",
    lastFlat: "A-2102",
  },
  {
    block: "B",
    carpetAreaSqm: 277.26,
    flatCount: 36,
    firstFlat: "B-301",
    lastFlat: "B-2002",
  },
  {
    block: "B",
    carpetAreaSqm: 463.24,
    flatCount: 2,
    firstFlat: "B-2101",
    lastFlat: "B-2102",
  },
];

/** A unit type with one room whose area is `roomsSqft` (the real ones have many). */
const variant = (
  variantName: string,
  roomsSqft: number | null,
  carpetSqft?: number,
) => ({
  variantName,
  ...(roomsSqft === null
    ? {}
    : { dimensions: { rooms: [{ name: "All rooms", areaSqft: roomsSqft }] } }),
  areas:
    carpetSqft === undefined ? [] : [{ basis: "carpet", areaSqft: carpetSqft }],
});

/** Kimana's six unit types with the room totals stored in the local database. */
const KIMANA_TYPES = [
  variant("Block A - 3rd Floor Unit (301 & 302)", 3980.44),
  variant("Block A - Typical Floor Unit (401 to 2001 & 402 to 2002)", 3715.93),
  variant(
    "Block A Penthouse - Unit 2101 / 2102 (21st Floor Lower Level + 22nd Floor Upper Level)",
    5268.05,
  ),
  variant("Block B - 3rd Floor Unit (301 & 302)", 3515.72),
  variant("Block B - Typical Floor Unit (401 to 2001 & 402 to 2002)", 2894.53),
  variant(
    "Block B Penthouse - Unit 2101 / 2102 (21st Floor Lower Level + 22nd Floor Upper Level)",
    4217.14,
  ),
];

describe("reading a flat number", () => {
  it.each([
    ["A-301", "A"],
    ["b-2102", "B"],
    ["B1/204", "B1"],
    ["C 12", "C"],
    ["301", null],
    ["12-301", null],
    ["", null],
  ])("%s is in block %s", (flat, block) => {
    expect(blockOfFlat(flat)).toBe(block);
  });
});

describe("the block a unit type names", () => {
  it.each([
    ["Block A - 3rd Floor Unit", "A"],
    ["Block B Penthouse - Unit 2101", "B"],
    ["Tower C 3BHK", "C"],
    ["wing-d typical", "D"],
    ["Type A", null],
    ["3 BHK Premium", null],
    ["Block A and Block B duplex", null],
  ])("%s -> %s", (name, block) => {
    expect(blockNamedIn(name)).toBe(block);
  });
});

describe("grouping flats", () => {
  it("makes one group per block and carpet area, with the first and last flat in natural order", () => {
    const groups = groupCarpetAreas([
      { flatNumber: "A-1001", carpetAreaSqm: 10 },
      { flatNumber: "A-301", carpetAreaSqm: 10 },
      { flatNumber: "A-302", carpetAreaSqm: 10 },
      { flatNumber: "A-2101", carpetAreaSqm: 20 },
      { flatNumber: "B-301", carpetAreaSqm: 10 },
      { flatNumber: "401", carpetAreaSqm: 5 },
    ]);
    expect(groups).toEqual([
      {
        block: "A",
        carpetAreaSqm: 10,
        flatCount: 3,
        firstFlat: "A-301",
        lastFlat: "A-1001",
      },
      {
        block: "A",
        carpetAreaSqm: 20,
        flatCount: 1,
        firstFlat: "A-2101",
        lastFlat: "A-2101",
      },
      {
        block: "B",
        carpetAreaSqm: 10,
        flatCount: 1,
        firstFlat: "B-301",
        lastFlat: "B-301",
      },
      {
        block: null,
        carpetAreaSqm: 5,
        flatCount: 1,
        firstFlat: "401",
        lastFlat: "401",
      },
    ]);
  });
});

describe("converting once from square metres", () => {
  it("369.54 sq m is 3,977.70 sq ft, from the exact definition of the foot", () => {
    expect(groupSqft(KIMANA[0])).toBe(3977.7);
    expect(groupSqft(KIMANA[1])).toBe(6163.31);
  });
});

describe("a unit type's room total", () => {
  it("adds rooms only, using an area or length times width, and is null with nothing to add", () => {
    expect(
      roomsTotalSqft({
        dimensions: {
          rooms: [
            { name: "Hall", lengthFt: 10, widthFt: 20 },
            { name: "Bedroom", areaSqft: 150 },
            { name: "Unmeasured" },
          ],
          balconies: [{ name: "Balcony", areaSqft: 999 }],
          foyer: { name: "Foyer", areaSqft: 999 },
        },
      }),
    ).toBe(350);
    expect(roomsTotalSqft({ dimensions: { rooms: [] } })).toBeNull();
    expect(roomsTotalSqft({ variantName: "x" })).toBeNull();
  });
});

describe("matching RERA carpet areas to Kimana's six unit types", () => {
  const { rows, proposedVariants } = compareCarpetAreas(KIMANA, KIMANA_TYPES);

  it("offers each type the RERA figure of its own block and kind of flat", () => {
    expect(rows.map((row) => row.reraSqft)).toEqual([
      3977.7, // A 3rd floor
      3977.7, // A typical: the same RERA area as the 3rd floor
      6163.31, // A penthouse
      2984.4, // B 3rd floor
      2984.4, // B typical
      4986.27, // B penthouse
    ]);
  });

  it("says when a figure was picked as the nearest of several, so it is checked", () => {
    expect(rows.every((row) => row.how === "nearest")).toBe(true);
    expect(rows[0].note).toMatch(/nearest of 2 carpet areas in this block/i);
    expect(rows[0].note).toMatch(/36 flats, A-301 to A-2002/);
  });

  it("proposes every type, none held yet, as new carpet-area values", () => {
    expect(rows.every((row) => row.status === "not_held")).toBe(true);
    expect(proposedVariants).toHaveLength(6);
    expect(proposedVariants?.[2]).toMatchObject({
      areas: [{ basis: "carpet", areaSqft: 6163.31 }],
    });
    // Rooms are carried through untouched.
    expect(proposedVariants?.[2].dimensions).toEqual(
      KIMANA_TYPES[2].dimensions,
    );
  });

  it("shows the rooms-against-RERA gap without flagging ordinary reading noise", () => {
    expect(rows.map((row) => Math.round((row.roomsGap ?? 0) * 100))).toEqual([
      0, -7, -15, 18, -3, -15,
    ]);
    expect(rows.some((row) => row.roomsGapFlagged)).toBe(false);
  });
});

describe("the rooms cross-check", () => {
  it("flags room sizes saved in metres as feet, and offers no figure it cannot trust", () => {
    // Metres read as feet: about a tenth of the real area.
    const wrongUnit = [variant("Block A - Typical", 3716 / 10.7639)];
    const [row] = compareCarpetAreas(KIMANA, wrongUnit).rows;
    expect(row.reraSqft).toBeNull();
    expect(row.status).toBe("unmatched");
    expect(row.note).toMatch(/room sizes add up to 345 sq ft/i);
    expect(row.note).toMatch(/not close to any RERA carpet area/i);
    expect(row.note).toMatch(/unit/i);
  });

  it("flags a matched type whose rooms are far from RERA's figure", () => {
    // 5,400 sq ft of rooms against RERA's 3,978: 36% over, and still near enough
    // to be the same type (an undersized total is far more likely a wrong unit,
    // which the case above catches).
    const [row] = compareCarpetAreas(
      [KIMANA[0]],
      [variant("Block A - Odd", 5400)],
    ).rows;
    expect(row.reraSqft).toBe(3977.7);
    expect(row.roomsGap).toBeCloseTo(0.3575, 3);
    expect(row.roomsGapFlagged).toBe(true);
  });
});

describe("matching rules", () => {
  it("takes the only area in a block without needing a reference", () => {
    const [row] = compareCarpetAreas(
      [KIMANA[0]],
      [variant("Block A - Any", null)],
    ).rows;
    expect(row).toMatchObject({
      reraSqft: 3977.7,
      how: "only_area",
      status: "not_held",
    });
  });

  it("offers nothing when a block has several areas and there is nothing to choose by", () => {
    const [row] = compareCarpetAreas(KIMANA, [
      variant("Block A - Any", null),
    ]).rows;
    expect(row.reraSqft).toBeNull();
    expect(row.note).toMatch(/several carpet areas/i);
  });

  it("uses the type's own carpet area, over its rooms, to choose", () => {
    // Rooms say 5,268 (nearer the penthouse) but the held carpet area says 3,978.
    const [row] = compareCarpetAreas(KIMANA, [
      variant("Block A - X", 5268, 3978),
    ]).rows;
    expect(row.reraSqft).toBe(3977.7);
    expect(row.status).toBe("same");
  });

  it("does not offer a figure more than 40% from what the type shows", () => {
    const [row] = compareCarpetAreas(KIMANA, [
      variant("Block A - Small", 1500),
    ]).rows;
    expect(row.reraSqft).toBeNull();
  });

  it("does not choose between two equally close areas", () => {
    const twins: RegulatorCarpetGroup[] = [
      {
        block: "A",
        carpetAreaSqm: 100,
        flatCount: 1,
        firstFlat: "A-1",
        lastFlat: "A-1",
      },
      {
        block: "A",
        carpetAreaSqm: 120,
        flatCount: 1,
        firstFlat: "A-2",
        lastFlat: "A-2",
      },
    ];
    const middle = (groupSqft(twins[0]) + groupSqft(twins[1])) / 2;
    const [row] = compareCarpetAreas(twins, [
      variant("Block A - Mid", middle),
    ]).rows;
    expect(row.reraSqft).toBeNull();
    expect(row.note).toMatch(/equally close/i);
  });

  it("does not take 'Type A' for block A: with no block named, every area is a candidate", () => {
    const [row] = compareCarpetAreas(KIMANA, [variant("Type A", 4200)]).rows;
    // The nearest of all four is block A's 3,978, chosen by size, not by the letter.
    expect(row.reraSqft).toBe(3977.7);
    const [none] = compareCarpetAreas(KIMANA, [variant("Type A", null)]).rows;
    expect(none.reraSqft).toBeNull();
  });

  it("says so when RERA lists no flats in the block a type names", () => {
    const [row] = compareCarpetAreas(
      [KIMANA[0]],
      [variant("Block Z - X", 3900)],
    ).rows;
    expect(row.reraSqft).toBeNull();
    expect(row.note).toMatch(/no flats in block Z/i);
  });

  it("proposes nothing when RERA lists no areas, and when everything already matches", () => {
    expect(compareCarpetAreas([], KIMANA_TYPES).proposedVariants).toBeNull();
    // With nothing listed, the one note lives above the table, not on each row.
    expect(compareCarpetAreas([], KIMANA_TYPES).rows[0].note).toBeNull();
    const held = compareCarpetAreas(KIMANA, [
      variant("Block A - 3rd", 3980, 3978),
      variant("Block B - 3rd", 3500, 2984.4),
    ]);
    expect(held.rows.map((row) => row.status)).toEqual(["same", "same"]);
    expect(held.proposedVariants).toBeNull();
  });

  it("replaces a different held carpet area and keeps every other area", () => {
    const { rows, proposedVariants } = compareCarpetAreas(KIMANA, [
      {
        variantName: "Block A - 3rd",
        areas: [
          { basis: "super_built_up", areaSqft: 5000 },
          { basis: "carpet", areaSqft: 3500 },
        ],
      },
    ]);
    expect(rows[0].status).toBe("differs");
    expect(proposedVariants?.[0].areas).toEqual([
      { basis: "super_built_up", areaSqft: 5000 },
      { basis: "carpet", areaSqft: 3977.7 },
    ]);
  });

  it("copes with no unit types and with malformed ones", () => {
    expect(compareCarpetAreas(KIMANA, undefined).rows).toEqual([]);
    expect(compareCarpetAreas(KIMANA, [null, 3, { nope: true }]).rows).toEqual(
      [],
    );
  });
});
