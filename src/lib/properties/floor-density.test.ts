import { describe, expect, it } from "vitest";
import type { TowerFloors } from "@/lib/rera/towers";
import {
  blocksOfUnitType,
  typicalUnitsPerFloor,
  unitsPerFloorOf,
  unitsPerFloorText,
} from "./floor-density";
import type { PropertyDossier } from "./types";

type Input = Pick<PropertyDossier, "rera" | "unitVariants">;

const tower = (name: string, unitsPerFloor: number): TowerFloors => ({
  name,
  floors: 29,
  unitsPerFloor,
  minPerFloor: unitsPerFloor,
  maxPerFloor: unitsPerFloor,
  flats: 29 * unitsPerFloor,
});

const withRera = (
  towers: TowerFloors[] | null,
  variants: [string, number | null][] = [],
): Input =>
  ({
    rera: { facts: towers === null ? null : { towers } },
    unitVariants: variants.map(([variantName, unitsPerFloor], i) => ({
      id: `v${i}`,
      variantName,
      unitsPerFloor,
    })),
  }) as unknown as Input;

describe("units per floor, found rather than divided", () => {
  it("counts from RERA's flat numbers first, as on Anamika (4 on every floor of 5 towers)", () => {
    const dossier = withRera(
      ["A", "B", "C", "D", "E"].map((name) => tower(name, 4)),
      [["Block A - 5 BHLK (Unit 201)", 2]],
    );
    expect(unitsPerFloorOf(dossier)?.source).toBe("rera");
    expect(unitsPerFloorText(dossier)).toBe("4 in each of 5 towers");
    expect(typicalUnitsPerFloor(unitsPerFloorOf(dossier)!)).toBe(4);
  });

  it("names each tower when they differ", () => {
    expect(unitsPerFloorText(withRera([tower("A", 4), tower("B", 2)]))).toBe(
      "A: 4, B: 2",
    );
  });

  it("falls back to a typical floor plan that is the whole floor, as on Kimana", () => {
    const dossier = withRera(null, [
      ["Block A - 3rd Floor Unit (301 & 302)", 2],
      ["Block A - Typical Floor Unit (401 to 2001 & 402 to 2002)", 2],
      ["Block A Penthouse - Unit 2101 / 2102", 2],
      ["Block B - Typical Floor Unit (401 to 2001 & 402 to 2002)", 2],
    ]);
    expect(unitsPerFloorOf(dossier)).toEqual({
      source: "brochure",
      towers: [
        { name: "A", unitsPerFloor: 2 },
        { name: "B", unitsPerFloor: 2 },
      ],
    });
    expect(unitsPerFloorText(dossier)).toBe("2 in A and B (floor plans)");
  });

  it("takes a block's only unit type, but says nothing for a floor shared by two unit types", () => {
    // Anamika's brochure: Block A has one unit type (4 a floor); B & E and C & D
    // each print two types on one floor, which states nothing about the floor.
    const dossier = withRera(null, [
      ["Block A - 5 BHLK Lifestyle Living (Unit 201)", 4],
      ["Block B & E - Type 1 (Units 201)", null],
      ["Block B & E - Type 2 (Units 204)", null],
      ["Block C & D - Type 1 (Unit 201)", 1],
      ["Block C & D - Type 2 (Unit 202)", 1],
    ]);
    expect(unitsPerFloorText(dossier)).toBe("4 in A (floor plans)");
  });

  it("is not stated when neither RERA nor a whole-floor plan says", () => {
    expect(
      unitsPerFloorOf(withRera(null, [["4 BHK Typical Floor Plan", null]])),
    ).toBeNull();
    expect(unitsPerFloorText(withRera([], []))).toBeNull();
  });
});

describe("blocksOfUnitType", () => {
  it("reads the blocks a unit type's name prints", () => {
    expect(blocksOfUnitType("Block B & E - Type 1")).toEqual(["B", "E"]);
    expect(blocksOfUnitType("Tower A - Type A")).toEqual(["A"]);
    expect(blocksOfUnitType("Blocks C and D - 4 BHLK")).toEqual(["C", "D"]);
    expect(blocksOfUnitType("5 BHK Penthouse")).toEqual([]);
  });
});
