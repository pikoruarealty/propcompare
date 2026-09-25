import { describe, expect, it } from "vitest";
import { readFlatNumber, towerCountOfBlocks, towerFloorsOf } from "./towers";

const floorsOf = (
  tower: string,
  fromFloor: number,
  toFloor: number,
  perFloor: number,
  block = "A+B",
) =>
  Array.from({ length: toFloor - fromFloor + 1 }, (_, i) =>
    Array.from({ length: perFloor }, (_, p) => ({
      block,
      flatNumber: `${tower}-${fromFloor + i}${String(p + 1).padStart(2, "0")}`,
    })),
  ).flat();

describe("readFlatNumber", () => {
  it("reads tower, floor and position from the numbers GujRERA prints", () => {
    expect(readFlatNumber("A-301")).toEqual({
      tower: "A",
      floor: "3",
      position: "01",
    });
    expect(readFlatNumber("T2-1204")).toEqual({
      tower: "T2",
      floor: "12",
      position: "04",
    });
    expect(readFlatNumber("b 2004")).toEqual({
      tower: "B",
      floor: "20",
      position: "04",
    });
    expect(readFlatNumber("301")).toEqual({
      tower: null,
      floor: "3",
      position: "01",
    });
    expect(readFlatNumber("A-G01")).toEqual({
      tower: "A",
      floor: "G",
      position: "01",
    });
  });

  it("does not read a number that is not tower, floor and position", () => {
    for (const odd of ["SHOP-1", "Office", "A-1", ""]) {
      expect(readFlatNumber(odd)).toBeNull();
    }
  });
});

describe("towerFloorsOf", () => {
  it("counts the typical floor per tower, as on Anamika (4 a floor, 29 floors, 5 towers)", () => {
    const flats = ["A", "B", "C", "D", "E"].flatMap((t) =>
      floorsOf(t, 2, 30, 4, "A+B+C+D+E"),
    );
    const towers = towerFloorsOf(flats)!;
    expect(towers.map((t) => t.name)).toEqual(["A", "B", "C", "D", "E"]);
    for (const tower of towers) {
      expect(tower).toMatchObject({ floors: 29, unitsPerFloor: 4, flats: 116 });
    }
  });

  it("takes the count most floors share, not a penthouse floor's, and keeps the range", () => {
    // Kimana: 2 a floor from 3 to 21, and the penthouses' upper level has none.
    const flats = [
      ...floorsOf("A", 3, 20, 2),
      { block: "A+B", flatNumber: "A-2101" },
    ];
    const [tower] = towerFloorsOf(flats)!;
    expect(tower).toMatchObject({
      unitsPerFloor: 2,
      minPerFloor: 1,
      maxPerFloor: 2,
    });
  });

  it("uses the block's name when the flat number names no tower", () => {
    const [tower] = towerFloorsOf(
      floorsOf("", 1, 3, 6, "Wing C").map((f) => ({
        ...f,
        flatNumber: f.flatNumber.slice(1),
      })),
    )!;
    expect(tower.name).toBe("Wing C");
    expect(tower.unitsPerFloor).toBe(6);
  });

  it("reports nothing when too many flat numbers do not read", () => {
    expect(towerFloorsOf([])).toBeNull();
    expect(
      towerFloorsOf([
        { block: "A", flatNumber: "SHOP-1" },
        { block: "A", flatNumber: "SHOP-2" },
        { block: "A", flatNumber: "A-101" },
      ]),
    ).toBeNull();
  });
});

describe("towerCountOfBlocks", () => {
  it("counts the towers a block name joins", () => {
    expect(towerCountOfBlocks(["T1+T2+T3+T4"])).toBe(4);
    expect(towerCountOfBlocks(["A+B+C+D+E"])).toBe(5);
    expect(towerCountOfBlocks(["A", "B", "C", "D"])).toBe(4);
    expect(towerCountOfBlocks(["Block A & Block B"])).toBe(2);
    expect(towerCountOfBlocks([])).toBeNull();
  });
});
