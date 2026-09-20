/**
 * Measurements: reading a printed length or area with its unit, and converting it
 * to feet or square feet.
 *
 * **Units are a no-errors area.** Everything we store is in feet (lengths) or
 * square feet (areas), and a number is only ever converted here, from a unit that
 * was actually printed. A number with no unit is never assumed to be feet: it is
 * refused. An unrecognised unit is refused, not guessed. Conversion happens once,
 * where a raw reading becomes our canonical value (`src/lib/ocr/adapter.ts` for
 * brochures, and the RERA display); stored values are never converted again.
 *
 * Pure and dependency-free so the rules can be tested exhaustively.
 */

export type LengthUnit = "ft" | "in" | "m" | "cm" | "mm";
export type AreaUnit = "sqft" | "sqm" | "sqyd" | "guntha" | "acre";
export type MeasurementKind = "length" | "area";

/** Exact international definitions: 1 ft = 0.3048 m; 1 yd = 3 ft. */
const FEET_PER: Record<LengthUnit, number> = {
  ft: 1,
  in: 1 / 12,
  m: 1 / 0.3048,
  cm: 1 / 30.48,
  mm: 1 / 304.8,
};

const SQFT_PER: Record<AreaUnit, number> = {
  sqft: 1,
  sqm: 1 / (0.3048 * 0.3048),
  sqyd: 9,
  // Gujarat and Maharashtra land measure: 1 guntha = 1,089 sq ft (33 ft by 33 ft).
  guntha: 1089,
  acre: 43_560,
};

/** Text with spacing, dots, hyphens, quotes and superscripts removed. */
const squash = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[²]/g, "2")
    .replace(/[\s.\-_,]/g, "");

const LENGTH_ALIASES: Record<string, LengthUnit> = {
  ft: "ft",
  feet: "ft",
  foot: "ft",
  "'": "ft",
  in: "in",
  inch: "in",
  inches: "in",
  '"': "in",
  m: "m",
  mt: "m",
  mtr: "m",
  mtrs: "m",
  meter: "m",
  meters: "m",
  metre: "m",
  metres: "m",
  cm: "cm",
  centimeter: "cm",
  centimeters: "cm",
  centimetre: "cm",
  centimetres: "cm",
  mm: "mm",
  millimeter: "mm",
  millimeters: "mm",
  millimetre: "mm",
  millimetres: "mm",
};

const AREA_ALIASES: Record<string, AreaUnit> = {
  sqft: "sqft",
  sft: "sqft",
  ft2: "sqft",
  squarefeet: "sqft",
  squarefoot: "sqft",
  sqfeet: "sqft",
  sqm: "sqm",
  sqmt: "sqm",
  sqmtr: "sqm",
  sqmtrs: "sqm",
  sqmeter: "sqm",
  sqmeters: "sqm",
  sqmetre: "sqm",
  sqmetres: "sqm",
  m2: "sqm",
  squaremeter: "sqm",
  squaremeters: "sqm",
  squaremetre: "sqm",
  squaremetres: "sqm",
  sqyd: "sqyd",
  sqyds: "sqyd",
  sqyard: "sqyd",
  sqyards: "sqyd",
  yd2: "sqyd",
  squareyard: "sqyd",
  squareyards: "sqyd",
  gaj: "sqyd",
  sqgaj: "sqyd",
  guntha: "guntha",
  gunthas: "guntha",
  acre: "acre",
  acres: "acre",
};

export const parseLengthUnit = (text: unknown): LengthUnit | null =>
  typeof text === "string" ? (LENGTH_ALIASES[squash(text)] ?? null) : null;

export const parseAreaUnit = (text: unknown): AreaUnit | null =>
  typeof text === "string" ? (AREA_ALIASES[squash(text)] ?? null) : null;

export const lengthToFeet = (value: number, unit: LengthUnit): number =>
  value * FEET_PER[unit];

export const areaToSqft = (value: number, unit: AreaUnit): number =>
  value * SQFT_PER[unit];

/** Stored to two decimals; never rounds a real reading down to zero. */
const store = (value: number): number | null => {
  const rounded = Math.round(value * 100) / 100;
  return Number.isFinite(rounded) && rounded > 0 ? rounded : null;
};

export type MeasurementResult =
  | {
      ok: true;
      /** In feet for a length, square feet for an area. */
      value: number;
      /** The unit the reading was in before conversion, for provenance. */
      from: LengthUnit | AreaUnit;
      /** Whether the unit came with the number or from the plan's legend. */
      unitSource: "printed" | "legend";
    }
  | { ok: false; reason: string };

const NUMBER = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)`;
const FEET_INCHES = new RegExp(
  String.raw`^${NUMBER}\s*(?:'|ft\.?|feet|foot)\s*-?\s*${NUMBER}\s*(?:"|in\.?|inch|inches)?$`,
  "i",
);
// A unit starts with a letter or a quote mark, never a digit or a decimal point.
const NUMBER_UNIT = new RegExp(String.raw`^${NUMBER}\s*([a-zA-Z'"²].*)$`, "i");
const PLAIN_NUMBER = new RegExp(String.raw`^${NUMBER}$`);

const readNumber = (text: string): number => Number(text.replace(/,/g, ""));

const fail = (reason: string): MeasurementResult => ({ ok: false, reason });

/**
 * Reads one printed measurement and converts it.
 *
 * `raw` is what was printed: a number, or text such as `4.36 m`, `4360 mm`,
 * `12'-6"` or `1,250 sq ft`. A unit printed with the number always wins. A bare
 * number takes `legendUnit`, the unit the plan states once for everything on it
 * ("all dimensions in mm"). With neither, the measurement is refused: nothing is
 * ever assumed to be feet.
 */
export const readMeasurement = (
  raw: unknown,
  kind: MeasurementKind,
  legendUnit?: unknown,
): MeasurementResult => {
  const parseUnit = kind === "length" ? parseLengthUnit : parseAreaUnit;
  const legend =
    legendUnit === undefined || legendUnit === null || legendUnit === ""
      ? null
      : parseUnit(legendUnit);
  if (
    legendUnit !== undefined &&
    legendUnit !== null &&
    legendUnit !== "" &&
    legend === null
  ) {
    return fail(`the plan's unit "${String(legendUnit)}" is not recognised`);
  }

  const convert = (
    number: number,
    unit: LengthUnit | AreaUnit,
    unitSource: "printed" | "legend",
  ): MeasurementResult => {
    if (!Number.isFinite(number) || number <= 0) {
      return fail("a measurement must be a number above zero");
    }
    const feet =
      kind === "length"
        ? lengthToFeet(number, unit as LengthUnit)
        : areaToSqft(number, unit as AreaUnit);
    const value = store(feet);
    return value === null
      ? fail("the measurement is too small to store")
      : { ok: true, value, from: unit, unitSource };
  };

  if (typeof raw === "number") {
    return legend === null
      ? fail("no unit is printed for this number")
      : convert(raw, legend, "legend");
  }
  if (typeof raw !== "string" || raw.trim() === "") {
    return fail("not a measurement");
  }
  const text = raw.trim();

  if (PLAIN_NUMBER.test(text)) {
    return legend === null
      ? fail("no unit is printed for this number")
      : convert(readNumber(text), legend, "legend");
  }

  if (kind === "length") {
    const feetInches = FEET_INCHES.exec(text);
    if (feetInches) {
      const feet = readNumber(feetInches[1]);
      const inches = readNumber(feetInches[2]);
      if (inches >= 12) return fail("inches must be below 12");
      return convert(feet + inches / 12, "ft", "printed");
    }
  }
  const withUnit = NUMBER_UNIT.exec(text);
  if (withUnit) {
    const unit = parseUnit(withUnit[2]);
    if (unit === null) {
      return fail(`the unit "${withUnit[2].trim()}" is not recognised`);
    }
    return convert(readNumber(withUnit[1]), unit, "printed");
  }
  return fail(`"${text}" is not a measurement`);
};

export interface RoomSize {
  name: string;
  lengthFt?: number;
  widthFt?: number;
  areaSqft?: number;
}

const roomArea = (room: RoomSize): number | undefined =>
  room.areaSqft ??
  (room.lengthFt !== undefined && room.widthFt !== undefined
    ? room.lengthFt * room.widthFt
    : undefined);

/**
 * A unit type's room sizes looked at as feet and square feet, to catch a unit that
 * slipped through: metres saved as feet is the classic (a 4.36 by 7 ft bedroom).
 * Judged over the whole set, because a duct or a toilet is legitimately tiny while
 * a home whose *largest* room is under 60 sq ft, or that has a side over 120 ft, is
 * in the wrong unit. Returns a plain-words warning or null. A warning never blocks
 * anything: it tells a person to check.
 */
export const dimensionsWarning = (rooms: RoomSize[]): string | null => {
  const areas = rooms
    .map(roomArea)
    .filter((area): area is number => area !== undefined);
  if (areas.length >= 2) {
    const largest = Math.max(...areas);
    if (largest < 60) {
      return `The largest room here is only ${Math.round(largest)} sq ft, which is too small for feet. Were these sizes in metres?`;
    }
  }
  const longest = Math.max(
    0,
    ...rooms.flatMap((room) => [room.lengthFt ?? 0, room.widthFt ?? 0]),
  );
  if (longest > 120) {
    return "A side here is over 120 ft, which is too large for a room. Were these sizes in inches or millimetres?";
  }
  return null;
};
