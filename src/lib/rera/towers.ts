/**
 * Towers and units per floor, read from the regulator's own list of flats and
 * blocks (owner direction, 2026-09-25: find it, do not divide it).
 *
 * A registered flat number names its tower, floor and position: "A-301" is tower
 * A, floor 3, the first flat; "T2-1204" is tower T2, floor 12, the fourth. So the
 * flats on each floor of each tower can be counted, and the count most floors
 * share is the tower's typical floor. Dividing the units by towers and floors
 * gets this wrong whenever a floor has no flats (a stilt, a podium, a refuge
 * floor) or a penthouse floor has fewer: Anamika's 580 flats over 5 towers of
 * 31 floors divide to 3.7, but every one of its 29 residential floors has 4.
 *
 * Pure, and it refuses rather than guesses: when too many flat numbers do not
 * read as tower, floor and position, it reports nothing.
 */

export interface TowerFloors {
  /** The tower's name as the flat numbers print it ("A", "T2"), else the block's. */
  name: string;
  /** Floors that have at least one flat. */
  floors: number;
  /** Flats on the typical floor: the count most floors share (ties: the larger). */
  unitsPerFloor: number;
  /** The fewest and most flats on any one floor. */
  minPerFloor: number;
  maxPerFloor: number;
  flats: number;
}

const FLAT = /^(?:([A-Z][A-Z0-9]*?)\s*[-/ ]?\s*)?(G|\d{1,3})(\d{2})$/;

/** Tower, floor and position of a flat number, or null when it does not read so. */
export const readFlatNumber = (
  flatNumber: string,
): { tower: string | null; floor: string; position: string } | null => {
  const match = FLAT.exec(flatNumber.trim().toUpperCase());
  if (!match) return null;
  return { tower: match[1] ?? null, floor: match[2], position: match[3] };
};

/** Share of flat numbers that must read cleanly for the counts to be trusted. */
const MIN_READABLE = 0.9;

export const towerFloorsOf = (
  flats: readonly { block: string; flatNumber: string }[],
): TowerFloors[] | null => {
  if (flats.length === 0) return null;
  const perTower = new Map<string, Map<string, number>>();
  let readable = 0;
  for (const flat of flats) {
    const read = readFlatNumber(flat.flatNumber);
    if (!read) continue;
    readable += 1;
    const tower = read.tower ?? flat.block;
    const floors = perTower.get(tower) ?? new Map<string, number>();
    floors.set(read.floor, (floors.get(read.floor) ?? 0) + 1);
    perTower.set(tower, floors);
  }
  if (readable / flats.length < MIN_READABLE) return null;

  return [...perTower.entries()]
    .map(([name, floors]): TowerFloors => {
      const counts = [...floors.values()];
      const often = new Map<number, number>();
      for (const count of counts) often.set(count, (often.get(count) ?? 0) + 1);
      const [unitsPerFloor] = [...often.entries()].sort(
        (a, b) => b[1] - a[1] || b[0] - a[0],
      )[0];
      return {
        name,
        floors: floors.size,
        unitsPerFloor,
        minPerFloor: Math.min(...counts),
        maxPerFloor: Math.max(...counts),
        flats: counts.reduce((sum, count) => sum + count, 0),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
};

/**
 * Towers a list of registered blocks names: a block "T1+T2+T3+T4" or "A & B" is
 * several towers under one registration. Null when there are no blocks.
 */
export const towerCountOfBlocks = (
  blockNames: readonly string[],
): number | null => {
  if (blockNames.length === 0) return null;
  return blockNames.reduce(
    (sum, name) =>
      sum +
      name
        .split(/\s*(?:\+|&|,|\band\b)\s*/i)
        .filter((part) => part.trim() !== "").length,
    0,
  );
};
