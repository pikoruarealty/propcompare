import type { PropertyDossier } from "./types";

/**
 * How many homes share one floor of a tower, for the whole floor: not the count of
 * one unit type on its floor (that is the unit type's own stated value, which on a
 * floor with three unit types is a third of the answer, and summing the types
 * overcounts because they sit on different floors: `DECISIONS.md` 2026-09-25).
 *
 * Worked out from three stated facts and nothing else: the project's units divided
 * by its towers and by the floors of a tower. It is an average, so it is worded
 * "about" wherever it is shown: a ground floor, a podium or a penthouse level pulls
 * it a little below a typical floor. If any of the three is missing the answer is
 * `null` ("not stated"), never a smaller or wrong number.
 */

const whole = (value: number | null): number | null =>
  value !== null && Number.isInteger(value) && value > 0 ? value : null;

export interface FloorDensity {
  perFloor: number;
  units: number;
  towers: number;
  floors: number;
}

export const unitsPerFloorOf = (
  dossier: Pick<PropertyDossier, "totalUnits" | "totalTowers" | "totalFloors">,
): FloorDensity | null => {
  const units = whole(dossier.totalUnits);
  const towers = whole(dossier.totalTowers);
  const floors = whole(dossier.totalFloors);
  if (units === null || towers === null || floors === null) return null;
  return { perFloor: units / (towers * floors), units, towers, floors };
};

const oneDecimal = (value: number): string =>
  String(Math.round(value * 10) / 10);

/** "about 3.7" for a table cell. */
export const unitsPerFloorShort = (
  dossier: Pick<PropertyDossier, "totalUnits" | "totalTowers" | "totalFloors">,
): string | null => {
  const found = unitsPerFloorOf(dossier);
  return found === null ? null : `about ${oneDecimal(found.perFloor)}`;
};

/** "about 3.7 (580 units, 5 towers, 31 floors)", the working shown beside it. */
export const unitsPerFloorText = (
  dossier: Pick<PropertyDossier, "totalUnits" | "totalTowers" | "totalFloors">,
): string | null => {
  const found = unitsPerFloorOf(dossier);
  if (found === null) return null;
  const noun = (count: number, one: string, many: string) =>
    `${count} ${count === 1 ? one : many}`;
  return `about ${oneDecimal(found.perFloor)} (${noun(found.units, "unit", "units")}, ${noun(found.towers, "tower", "towers")}, ${noun(found.floors, "floor", "floors")})`;
};
