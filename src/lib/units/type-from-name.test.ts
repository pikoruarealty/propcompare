import { describe, expect, it } from "vitest";
import { unitTypeKeysFromName, withKeysFromName } from "./type-from-name";

describe("unitTypeKeysFromName", () => {
  it("reads the bedroom count and a layout word the name prints", () => {
    expect(
      unitTypeKeysFromName("4 BHK Duplex (Lower + Upper Floor Plan)"),
    ).toEqual({ bhkTypeKey: "4bhk", layoutTypeKey: "duplex" });
    expect(
      unitTypeKeysFromName("5 BHK Penthouse (Lower + Upper Floor Plan)"),
    ).toEqual({ bhkTypeKey: "5bhk_plus", layoutTypeKey: "penthouse" });
  });

  it("reads each of one to four bedrooms, five and above as 5 BHK, and a studio", () => {
    expect(unitTypeKeysFromName("1 BHK").bhkTypeKey).toBe("1bhk");
    expect(unitTypeKeysFromName("2BHK Type A").bhkTypeKey).toBe("2bhk");
    expect(unitTypeKeysFromName("3 BHK Premium - Unit 03").bhkTypeKey).toBe(
      "3bhk",
    );
    expect(unitTypeKeysFromName("Block B - 4 BHK Classy").bhkTypeKey).toBe(
      "4bhk",
    );
    expect(unitTypeKeysFromName("6 BHK Mansion").bhkTypeKey).toBe("5bhk_plus");
    expect(unitTypeKeysFromName("Studio Apartment").bhkTypeKey).toBe("studio");
  });

  it("accepts the spelling a brochure prints for 5 BHK (BHLK)", () => {
    expect(
      unitTypeKeysFromName("Block A - 5 BHLK Lifestyle Living (Unit 201)"),
    ).toEqual({ bhkTypeKey: "5bhk_plus" });
  });

  it("reads a layout without a bedroom count, and takes the first layout word printed", () => {
    expect(
      unitTypeKeysFromName(
        "Block A Penthouse - Unit 2101 / 2102 (21st Floor Lower Level + 22nd Floor Upper Level)",
      ),
    ).toEqual({ layoutTypeKey: "penthouse" });
    expect(unitTypeKeysFromName("Duplex Penthouse").layoutTypeKey).toBe(
      "duplex",
    );
  });

  it("gives nothing for a name that prints neither, and never guesses from other words", () => {
    for (const name of [
      "Tower A - Type A",
      "4 BHK Typical Floor Plan" /* bedrooms yes, layout no */,
      "Premium - Unit 03",
      "Block A - Typical Floor Unit (401 to 2001 & 402 to 2002)",
    ]) {
      expect(unitTypeKeysFromName(name).layoutTypeKey).toBeUndefined();
    }
    expect(unitTypeKeysFromName("Tower A - Type A")).toEqual({});
    // A digit that is not a bedroom count is not read as one.
    expect(unitTypeKeysFromName("Unit 3 Type B")).toEqual({});
    expect(unitTypeKeysFromName("Penthouses 2 to 4")).toEqual({});
  });
});

describe("withKeysFromName", () => {
  it("fills what is missing and never replaces a key already there", () => {
    expect(
      withKeysFromName({
        variantName: "4 BHK Duplex",
        bhkTypeKey: "5bhk_plus",
      }),
    ).toEqual({
      variantName: "4 BHK Duplex",
      bhkTypeKey: "5bhk_plus",
      layoutTypeKey: "duplex",
    });
    expect(withKeysFromName({ variantName: "Type A" })).toEqual({
      variantName: "Type A",
    });
  });
});
