import { describe, expect, it } from "vitest";
import {
  unitsPerFloorOf,
  unitsPerFloorShort,
  unitsPerFloorText,
} from "./floor-density";

const stated = (
  totalUnits: number | null,
  totalTowers: number | null,
  totalFloors: number | null,
) => ({ totalUnits, totalTowers, totalFloors });

describe("units per floor for the whole floor", () => {
  it("divides the project's units by its towers and the floors of a tower", () => {
    // Anamika High Point: 580 units, 5 towers, 31 floors.
    const found = unitsPerFloorOf(stated(580, 5, 31));
    expect(found?.perFloor).toBeCloseTo(3.742, 3);
    expect(unitsPerFloorShort(stated(580, 5, 31))).toBe("about 3.7");
    expect(unitsPerFloorText(stated(580, 5, 31))).toBe(
      "about 3.7 (580 units, 5 towers, 31 floors)",
    );
  });

  it("says a whole number as one, and a single tower or floor in the singular", () => {
    expect(unitsPerFloorShort(stated(192, 4, 12))).toBe("about 4");
    expect(unitsPerFloorText(stated(20, 1, 1))).toBe(
      "about 20 (20 units, 1 tower, 1 floor)",
    );
  });

  it("is not stated when any of the three is missing, never a smaller or wrong number", () => {
    for (const missing of [
      stated(null, 2, 20),
      stated(76, null, 20),
      stated(76, 2, null),
      stated(76, null, null),
    ]) {
      expect(unitsPerFloorOf(missing)).toBeNull();
      expect(unitsPerFloorShort(missing)).toBeNull();
      expect(unitsPerFloorText(missing)).toBeNull();
    }
  });

  it("is not stated for a count that is zero, negative or fractional", () => {
    expect(unitsPerFloorOf(stated(0, 2, 20))).toBeNull();
    expect(unitsPerFloorOf(stated(76, 0, 20))).toBeNull();
    expect(unitsPerFloorOf(stated(76, 2, -1))).toBeNull();
    expect(unitsPerFloorOf(stated(76, 2.5, 20))).toBeNull();
  });
});
