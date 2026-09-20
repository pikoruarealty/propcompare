import { describe, expect, it } from "vitest";
import {
  areaToSqft,
  dimensionsWarning,
  lengthToFeet,
  parseAreaUnit,
  parseLengthUnit,
  readMeasurement,
} from "./measurements";

const value = (result: ReturnType<typeof readMeasurement>) => {
  if (!result.ok) throw new Error(`refused: ${result.reason}`);
  return result.value;
};

describe("unit names", () => {
  it.each([
    ["ft", "ft"],
    ["Feet", "ft"],
    ["FOOT", "ft"],
    ["'", "ft"],
    ["in", "in"],
    ['"', "in"],
    ["inches", "in"],
    ["m", "m"],
    ["Mtr.", "m"],
    ["meters", "m"],
    ["Metres", "m"],
    ["cm", "cm"],
    ["mm", "mm"],
    [" MM ", "mm"],
    ["millimetres", "mm"],
  ])("reads %j as the length unit %s", (text, unit) => {
    expect(parseLengthUnit(text)).toBe(unit);
  });

  it.each([
    ["sq ft", "sqft"],
    ["Sq.Ft.", "sqft"],
    ["sqft", "sqft"],
    ["SFT", "sqft"],
    ["square feet", "sqft"],
    ["sq m", "sqm"],
    ["Sq. Mtr", "sqm"],
    ["m²", "sqm"],
    ["m2", "sqm"],
    ["square metres", "sqm"],
    ["sq yd", "sqyd"],
    ["Sq. Yards", "sqyd"],
    ["gaj", "sqyd"],
    ["guntha", "guntha"],
    ["acres", "acre"],
  ])("reads %j as the area unit %s", (text, unit) => {
    expect(parseAreaUnit(text)).toBe(unit);
  });

  it("keeps lengths and areas apart", () => {
    // A length unit is not an area unit, and the reverse: "m" is not "sq m".
    expect(parseAreaUnit("m")).toBeNull();
    expect(parseAreaUnit("ft")).toBeNull();
    expect(parseLengthUnit("sq ft")).toBeNull();
    expect(parseLengthUnit("sqm")).toBeNull();
  });

  it.each(["", "  ", "yards", "cubits", "bigha", "feets", 5, null, undefined])(
    "does not guess at %j",
    (text) => {
      expect(parseLengthUnit(text)).toBeNull();
    },
  );
});

describe("conversion constants are exact", () => {
  it("uses 1 ft = 0.3048 m", () => {
    expect(lengthToFeet(0.3048, "m")).toBeCloseTo(1, 12);
    expect(lengthToFeet(304.8, "mm")).toBeCloseTo(1, 12);
    expect(lengthToFeet(30.48, "cm")).toBeCloseTo(1, 12);
    expect(lengthToFeet(12, "in")).toBe(1);
    expect(lengthToFeet(7, "ft")).toBe(7);
  });

  it("uses 1 sq m = 10.7639 sq ft and the local land measures", () => {
    expect(areaToSqft(1, "sqm")).toBeCloseTo(10.7639104, 6);
    expect(areaToSqft(7628, "sqm")).toBeCloseTo(82_107.1, 0);
    expect(areaToSqft(100, "sqyd")).toBe(900);
    expect(areaToSqft(1, "guntha")).toBe(1089);
    expect(areaToSqft(2, "acre")).toBe(87_120);
    expect(areaToSqft(1450, "sqft")).toBe(1450);
  });
});

describe("readMeasurement — lengths", () => {
  it("converts Kimana's values from metres, and gets the same answer from millimetres", () => {
    // The bedroom that was stored as 4.36 by 7 "ft".
    expect(value(readMeasurement("4.36 m", "length"))).toBe(14.3);
    expect(value(readMeasurement("7 m", "length"))).toBe(22.97);
    expect(value(readMeasurement("4360 mm", "length"))).toBe(14.3);
    expect(value(readMeasurement("7000 mm", "length"))).toBe(22.97);
    expect(value(readMeasurement("436 cm", "length"))).toBe(14.3);
  });

  it("takes a bare number from the plan's stated unit, and says where the unit came from", () => {
    const result = readMeasurement(4.36, "length", "m");
    expect(result).toEqual({
      ok: true,
      value: 14.3,
      from: "m",
      unitSource: "legend",
    });
    expect(value(readMeasurement("4360", "length", "mm"))).toBe(14.3);
    expect(value(readMeasurement(12.5, "length", "ft"))).toBe(12.5);
  });

  it("lets a unit printed with the number win over the plan's unit", () => {
    const result = readMeasurement("4.36 m", "length", "ft");
    expect(result).toMatchObject({
      ok: true,
      value: 14.3,
      unitSource: "printed",
    });
  });

  it.each([
    [`12'-6"`, 12.5],
    [`12' 6"`, 12.5],
    ["12 ft 6 in", 12.5],
    ["12ft-6in", 12.5],
    [`10'-0"`, 10],
    [`10'`, 10],
    [`8'-11"`, 8.92],
  ])("reads feet and inches: %s", (text, feet) => {
    expect(value(readMeasurement(text, "length"))).toBe(feet);
  });

  it("refuses twelve or more inches rather than carrying them silently", () => {
    expect(readMeasurement(`12'-14"`, "length")).toMatchObject({ ok: false });
  });

  it("reads thousands separators and decimals", () => {
    expect(value(readMeasurement("1,200 mm", "length"))).toBe(3.94);
    expect(value(readMeasurement("16.5 ft", "length"))).toBe(16.5);
  });

  it("stores two decimals", () => {
    expect(value(readMeasurement("3.3333333 m", "length"))).toBe(10.94);
  });
});

describe("readMeasurement — areas", () => {
  it("converts to square feet", () => {
    expect(value(readMeasurement("100 sq m", "area"))).toBe(1076.39);
    expect(value(readMeasurement("1,250 sq ft", "area"))).toBe(1250);
    expect(value(readMeasurement("200 sq yd", "area"))).toBe(1800);
    expect(value(readMeasurement("1 guntha", "area"))).toBe(1089);
    expect(value(readMeasurement(140, "area", "sqm"))).toBe(1506.95);
  });

  it("does not let a length unit stand for an area", () => {
    expect(readMeasurement("12 m", "area")).toMatchObject({ ok: false });
    expect(readMeasurement(12, "area", "m")).toMatchObject({ ok: false });
    expect(readMeasurement("12 sq m", "length")).toMatchObject({ ok: false });
  });
});

describe("readMeasurement — never assumes a unit", () => {
  it.each([[4.36], ["4.36"], [7], ["1,250"]])(
    "refuses %j with no unit anywhere",
    (raw) => {
      const result = readMeasurement(raw, "length");
      expect(result).toMatchObject({ ok: false });
      if (!result.ok) expect(result.reason).toMatch(/no unit is printed/);
    },
  );

  it.each([null, undefined, ""])(
    "treats a blank plan unit (%j) as none, not as feet",
    (legend) => {
      expect(readMeasurement(4.36, "length", legend)).toMatchObject({
        ok: false,
      });
    },
  );

  it("refuses a unit it does not recognise, whether printed or stated", () => {
    expect(readMeasurement("4.36 cubits", "length")).toMatchObject({
      ok: false,
    });
    // A wrong legend is not quietly replaced by feet.
    expect(readMeasurement(4.36, "length", "yards")).toMatchObject({
      ok: false,
    });
    expect(readMeasurement("4.36", "length", "yards")).toMatchObject({
      ok: false,
    });
  });

  it.each([0, -3, "0 m", "-2 ft", "abc", "m 4", {}, [], true, NaN, Infinity])(
    "refuses %j",
    (raw) => {
      expect(readMeasurement(raw, "length", "ft")).toMatchObject({ ok: false });
    },
  );

  it("refuses a measurement too small to store rather than storing zero", () => {
    expect(readMeasurement("0.0001 mm", "length")).toMatchObject({ ok: false });
  });
});

describe("dimensionsWarning — a unit that slipped through", () => {
  it("flags Kimana's stored sizes, which were metres saved as feet", () => {
    const warning = dimensionsWarning([
      { name: "BED ROOM", lengthFt: 4.36, widthFt: 7 },
      { name: "BED ROOM", lengthFt: 3.95, widthFt: 5.48 },
      { name: "BED ROOM", lengthFt: 5.49, widthFt: 3.65 },
      { name: "TOILET", lengthFt: 2.75, widthFt: 2.91 },
      { name: "DUCT", lengthFt: 1.53, widthFt: 1.53 },
    ]);

    expect(warning).toMatch(/only 31 sq ft/);
    expect(warning).toMatch(/metres/);
  });

  it("is quiet for ordinary sizes in feet, even with a tiny duct in the list", () => {
    expect(
      dimensionsWarning([
        { name: "Living", lengthFt: 16, widthFt: 12 },
        { name: "Bedroom", lengthFt: 14.3, widthFt: 22.97 },
        { name: "Duct", lengthFt: 1.53, widthFt: 1.53 },
      ]),
    ).toBeNull();
  });

  it("uses a stated area when there are no sides", () => {
    expect(
      dimensionsWarning([
        { name: "Bedroom", areaSqft: 150 },
        { name: "Living", areaSqft: 240 },
      ]),
    ).toBeNull();
    expect(
      dimensionsWarning([
        { name: "Bedroom", areaSqft: 12 },
        { name: "Living", areaSqft: 20 },
      ]),
    ).toMatch(/metres/);
  });

  it("flags sides that are far too large, as if in inches or millimetres", () => {
    expect(
      dimensionsWarning([
        { name: "Living", lengthFt: 4360, widthFt: 7000 },
        { name: "Bedroom", lengthFt: 3950, widthFt: 5480 },
      ]),
    ).toMatch(/inches or millimetres/);
  });

  it("says nothing about a single room or none, where there is nothing to compare", () => {
    expect(dimensionsWarning([])).toBeNull();
    expect(
      dimensionsWarning([{ name: "Study", lengthFt: 3, widthFt: 3 }]),
    ).toBeNull();
  });
});
