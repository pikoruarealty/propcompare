import type { PropertyDossier } from "./types";

/**
 * How many homes share one floor of a tower: the whole floor, per tower, found
 * rather than divided (owner direction, 2026-09-25).
 *
 * 1. **RERA first.** The regulator's flat numbers name tower, floor and position,
 *    so each tower's typical floor is counted from them (`towerFloorsOf`, kept in
 *    the RERA snapshot). This is exact: Anamika has 4 on each of its 29
 *    residential floors, where dividing its units by 31 floors gave 3.7.
 * 2. **Else the brochure, only where it says so.** A floor plan's own "units per
 *    floor" counts only the flats of that unit type, so it is the whole floor only
 *    when that plan is the whole floor: the one unit type of a block marked
 *    "typical", or a block's only unit type. Two unit types on one floor ("Block B
 *    & E - Type 1" and "Type 2") state nothing about the floor, and a sum or a
 *    highest unit number would be a guess, so such a block is not stated.
 * 3. Else not stated.
 */

export interface TowerUnits {
  name: string;
  unitsPerFloor: number;
}

export interface FloorUnits {
  source: "rera" | "brochure";
  towers: TowerUnits[];
}

const BLOCKS =
  /\b(?:block|tower|wing)s?\s*[-–:]?\s*([A-Z0-9]{1,3}(?:\s*(?:&|and|,|\+)\s*[A-Z0-9]{1,3})*)\b/i;

/** The blocks a unit type's name prints ("Block B & E" is B and E), or none. */
export const blocksOfUnitType = (name: string): string[] => {
  const match = BLOCKS.exec(name);
  if (!match) return [];
  return match[1]
    .split(/\s*(?:&|and|,|\+)\s*/i)
    .map((part) => part.trim().toUpperCase())
    .filter((part) => part !== "");
};

const fromBrochure = (
  variants: PropertyDossier["unitVariants"],
): TowerUnits[] => {
  const byBlock = new Map<string, PropertyDossier["unitVariants"]>();
  for (const variant of variants) {
    for (const block of blocksOfUnitType(variant.variantName)) {
      byBlock.set(block, [...(byBlock.get(block) ?? []), variant]);
    }
  }
  const towers: TowerUnits[] = [];
  for (const [block, list] of byBlock) {
    const typical = list.filter((v) => /\btypical\b/i.test(v.variantName));
    const whole =
      typical.length === 1 ? typical[0] : list.length === 1 ? list[0] : null;
    if (whole?.unitsPerFloor && whole.unitsPerFloor > 0) {
      towers.push({ name: block, unitsPerFloor: whole.unitsPerFloor });
    }
  }
  return towers.sort((a, b) =>
    a.name.localeCompare(b.name, "en", { numeric: true }),
  );
};

export const unitsPerFloorOf = (
  dossier: Pick<PropertyDossier, "rera" | "unitVariants">,
): FloorUnits | null => {
  const rera = dossier.rera.facts?.towers ?? null;
  if (rera && rera.length > 0) {
    return {
      source: "rera",
      towers: rera.map(({ name, unitsPerFloor }) => ({ name, unitsPerFloor })),
    };
  }
  const brochure = fromBrochure(dossier.unitVariants);
  return brochure.length > 0 ? { source: "brochure", towers: brochure } : null;
};

/** The count most towers share, for a number to compare on. */
export const typicalUnitsPerFloor = (found: FloorUnits): number => {
  const often = new Map<number, number>();
  for (const { unitsPerFloor } of found.towers) {
    often.set(unitsPerFloor, (often.get(unitsPerFloor) ?? 0) + 1);
  }
  return [...often.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
};

const listNames = (names: string[]): string =>
  names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/**
 * "4 in each of 5 towers", "A: 4, B: 2", or for the brochure "2 in A and B (floor
 * plans)" (a plan may say block, tower or wing, so the names stand alone). Null
 * when not stated.
 */
export const unitsPerFloorText = (
  dossier: Pick<PropertyDossier, "rera" | "unitVariants">,
): string | null => {
  const found = unitsPerFloorOf(dossier);
  if (found === null) return null;
  const counts = new Set(found.towers.map((t) => t.unitsPerFloor));
  const n = found.towers.length;
  if (found.source === "rera") {
    if (counts.size === 1) {
      const [count] = counts;
      return n === 1 ? `${count}` : `${count} in each of ${n} towers`;
    }
    return found.towers.map((t) => `${t.name}: ${t.unitsPerFloor}`).join(", ");
  }
  if (counts.size === 1) {
    const [count] = counts;
    return `${count} in ${listNames(found.towers.map((t) => t.name))} (floor plans)`;
  }
  return `${found.towers.map((t) => `${t.name}: ${t.unitsPerFloor}`).join(", ")} (floor plans)`;
};
