import { areaToSqft } from "@/lib/units/measurements";
import type { RegulatorCarpetGroup } from "./types";

/**
 * Carpet area from the regulator, per unit type.
 *
 * The regulator lists the carpet area of every flat, in square metres. We keep
 * only the distinct areas per block (`RegulatorCarpetGroup`) and offer each unit
 * type the RERA figure that belongs to it, for an admin to confirm. Nothing here
 * derives an area from room sizes: a type's room total or its own carpet area is
 * used only to choose *which exact RERA figure* to offer when a block has several,
 * and the choice is labelled so it gets checked. Regulator-agnostic: an adapter
 * turns its own rows into `{ flatNumber, carpetAreaSqm }`.
 */

/** Two carpet areas within this many square feet are the same figure (people round). */
const SAME_TOLERANCE_SQFT = 1;
/** A nearest RERA area further than this from the reference is not offered. */
const MAX_DISTANCE_RATIO = 0.4;
/** A rooms total this far from RERA's carpet area is flagged for a look. */
export const ROOMS_GAP_FLAG_RATIO = 0.3;

export interface FlatCarpetArea {
  flatNumber: string;
  carpetAreaSqm: number;
  /** Whether the regulator lists the flat as booked; absent when it did not say. */
  booked?: boolean;
  /** Exclusive balcony, veranda or open-terrace area, square metres. */
  exclusiveAreaSqm?: number;
}

/** The block a flat number names: "A-301" is block "A"; a number with no block
 * prefix ("301") names none. */
export const blockOfFlat = (flatNumber: string): string | null => {
  const match = /^\s*([A-Za-z][A-Za-z0-9]*)\s*[-/ ]\s*\S/.exec(flatNumber);
  return match ? match[1].toUpperCase() : null;
};

const collator = new Intl.Collator("en", { numeric: true });

/** Distinct carpet areas per block, with how many flats have each. */
export const groupCarpetAreas = (
  flats: FlatCarpetArea[],
): RegulatorCarpetGroup[] => {
  const groups = new Map<
    string,
    {
      block: string | null;
      carpetAreaSqm: number;
      flats: string[];
      /** Flats whose booked status the list gave, and how many were booked. */
      statedStatus: number;
      booked: number;
      exclusive: number[];
    }
  >();
  for (const flat of flats) {
    const block = blockOfFlat(flat.flatNumber);
    const key = `${block ?? ""}|${flat.carpetAreaSqm}`;
    const group = groups.get(key) ?? {
      block,
      carpetAreaSqm: flat.carpetAreaSqm,
      flats: [],
      statedStatus: 0,
      booked: 0,
      exclusive: [],
    };
    group.flats.push(flat.flatNumber);
    if (flat.booked !== undefined) {
      group.statedStatus += 1;
      if (flat.booked) group.booked += 1;
    }
    if (flat.exclusiveAreaSqm !== undefined) {
      group.exclusive.push(flat.exclusiveAreaSqm);
    }
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group): RegulatorCarpetGroup => {
      const sorted = [...group.flats].sort(collator.compare);
      return {
        block: group.block,
        carpetAreaSqm: group.carpetAreaSqm,
        flatCount: sorted.length,
        firstFlat: sorted[0],
        lastFlat: sorted[sorted.length - 1],
        // Only when every flat's status was stated: a partial count would read
        // as fewer booked than there are.
        ...(group.statedStatus === sorted.length
          ? { bookedCount: group.booked }
          : {}),
        ...(group.exclusive.length > 0
          ? {
              exclusiveAreaMinSqm: Math.min(...group.exclusive),
              exclusiveAreaMaxSqm: Math.max(...group.exclusive),
            }
          : {}),
      };
    })
    .sort(
      (a, b) =>
        (a.block === null ? 1 : 0) - (b.block === null ? 1 : 0) ||
        collator.compare(a.block ?? "", b.block ?? "") ||
        a.carpetAreaSqm - b.carpetAreaSqm,
    );
};

/** The one conversion from RERA's square metres, to two decimals. */
export const groupSqft = (group: RegulatorCarpetGroup): number =>
  Math.round(areaToSqft(group.carpetAreaSqm, "sqm") * 100) / 100;

/** "Block A: 3,978 sq ft (36 flats, A-301 to A-2002)" for display. */
export const describeGroup = (group: RegulatorCarpetGroup): string => {
  const sqft = Math.round(groupSqft(group)).toLocaleString("en-IN");
  const flats =
    group.flatCount === 1
      ? group.firstFlat
      : `${group.flatCount} flats, ${group.firstFlat} to ${group.lastFlat}`;
  return `${group.block ? `Block ${group.block}: ` : ""}${sqft} sq ft (${flats})`;
};

/** The single block a unit type's name points at ("Block A - 3rd Floor" is A);
 * null when it names none or names two. Only "block", "tower" or "wing" count, so
 * "Type A" is not mistaken for a block. */
export const blockNamedIn = (variantName: string): string | null => {
  const found = new Set<string>();
  for (const match of variantName.matchAll(
    /\b(?:block|tower|wing)\s*[-:]?\s*([A-Za-z][A-Za-z0-9]*)\b/gi,
  )) {
    found.add(match[1].toUpperCase());
  }
  return found.size === 1 ? [...found][0] : null;
};

interface RoomLike {
  areaSqft?: unknown;
  lengthFt?: unknown;
  widthFt?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const positive = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;

/** A room's area: its own figure, else length times width. */
const roomArea = (room: RoomLike): number | null => {
  const area = positive(room.areaSqft);
  if (area !== null) return area;
  const length = positive(room.lengthFt);
  const width = positive(room.widthFt);
  return length !== null && width !== null ? length * width : null;
};

/** The sum of a unit type's room sizes (rooms only: not balconies or the foyer),
 * or null when none can be added up. Shown as a cross-check; never stored. */
export const roomsTotalSqft = (variant: unknown): number | null => {
  const rooms =
    isRecord(variant) && isRecord(variant.dimensions)
      ? variant.dimensions.rooms
      : undefined;
  if (!Array.isArray(rooms)) return null;
  const areas = rooms
    .map((room) => (isRecord(room) ? roomArea(room) : null))
    .filter((area): area is number => area !== null);
  if (areas.length === 0) return null;
  return Math.round(areas.reduce((sum, area) => sum + area, 0) * 100) / 100;
};

const carpetOf = (variant: Record<string, unknown>): number | null => {
  const areas = Array.isArray(variant.areas) ? variant.areas : [];
  for (const area of areas) {
    if (isRecord(area) && area.basis === "carpet") {
      return positive(area.areaSqft);
    }
  }
  return null;
};

export type CarpetRowStatus = "same" | "differs" | "not_held" | "unmatched";

export interface CarpetUnitRow {
  variantName: string;
  /** The carpet area we hold for this type, square feet. */
  currentSqft: number | null;
  /** RERA's figure offered for this type, square feet (null when unmatched). */
  reraSqft: number | null;
  /** The RERA figure's flats, in words. */
  groupLabel: string | null;
  /** How the figure was chosen; "nearest" means a block had several and this was
   * the closest to the reference. */
  how: "only_area" | "nearest" | null;
  /** The sum of this type's room sizes, square feet: the cross-check figure. */
  roomsTotalSqft: number | null;
  /** Rooms total against RERA's carpet area, as a fraction (-0.07 is 7% under). */
  roomsGap: number | null;
  /** True when the rooms total is far enough from RERA's figure to look wrong. */
  roomsGapFlagged: boolean;
  status: CarpetRowStatus;
  /** Plain words for a row that needs explaining. */
  note: string | null;
}

const withCarpet = (
  variant: Record<string, unknown>,
  sqft: number,
): Record<string, unknown> => {
  const areas = Array.isArray(variant.areas) ? [...variant.areas] : [];
  const index = areas.findIndex(
    (area) => isRecord(area) && area.basis === "carpet",
  );
  const carpet = { basis: "carpet", areaSqft: sqft };
  if (index >= 0) areas[index] = carpet;
  else areas.push(carpet);
  return { ...variant, areas };
};

export interface CarpetComparison {
  groups: RegulatorCarpetGroup[];
  rows: CarpetUnitRow[];
  /** The full unit-type list with RERA's carpet area set on the matched types
   * that differ, or null when nothing would change. */
  proposedVariants: Record<string, unknown>[] | null;
}

/**
 * Sets the regulator's carpet areas beside a property's unit types. `variants` is
 * the unit-type list we would publish (a submission's candidate, else the live
 * one).
 */
export const compareCarpetAreas = (
  groups: RegulatorCarpetGroup[],
  variants: unknown,
): CarpetComparison => {
  const list = (Array.isArray(variants) ? variants : []).filter(
    (variant): variant is Record<string, unknown> =>
      isRecord(variant) && typeof variant.variantName === "string",
  );
  const proposed: Record<string, unknown>[] = [];
  let changes = 0;

  const rows = list.map((variant): CarpetUnitRow => {
    const variantName = variant.variantName as string;
    const currentSqft = carpetOf(variant);
    const rooms = roomsTotalSqft(variant);
    const reference = currentSqft ?? rooms;

    const named = blockNamedIn(variantName);
    const candidates =
      named !== null ? groups.filter((group) => group.block === named) : groups;

    let group: RegulatorCarpetGroup | null = null;
    let how: CarpetUnitRow["how"] = null;
    let note: string | null = null;
    if (groups.length === 0) {
      // Said once, above the table, not on every row.
      note = null;
    } else if (candidates.length === 0) {
      note = `RERA lists no flats in block ${named}.`;
    } else if (candidates.length === 1) {
      group = candidates[0];
      how = "only_area";
    } else if (reference === null) {
      note =
        "RERA lists several carpet areas here. Enter this type's carpet area or its room sizes so one can be chosen.";
    } else {
      const ranked = candidates
        .map((candidate) => ({
          candidate,
          distance: Math.abs(groupSqft(candidate) - reference),
        }))
        .sort((a, b) => a.distance - b.distance);
      if (Math.abs(ranked[0].distance - ranked[1].distance) < 0.01) {
        note = "Two RERA carpet areas are equally close, so none is offered.";
      } else {
        group = ranked[0].candidate;
        how = "nearest";
      }
    }

    // A figure far from what we know of this type is a different type's figure.
    if (
      group !== null &&
      reference !== null &&
      Math.abs(groupSqft(group) - reference) / reference > MAX_DISTANCE_RATIO
    ) {
      const figures = candidates
        .map((candidate) =>
          Math.round(groupSqft(candidate)).toLocaleString("en-IN"),
        )
        .join(", ");
      const own = Math.round(reference).toLocaleString("en-IN");
      note = `${currentSqft !== null ? "The carpet area held" : "The room sizes add up to"} ${own} sq ft, which is not close to any RERA carpet area for this type (${figures} sq ft), so none is offered. Check the sizes and their unit.`;
      group = null;
      how = null;
    }

    const reraSqft = group ? groupSqft(group) : null;
    const status: CarpetRowStatus =
      reraSqft === null
        ? "unmatched"
        : currentSqft === null
          ? "not_held"
          : Math.abs(currentSqft - reraSqft) <= SAME_TOLERANCE_SQFT
            ? "same"
            : "differs";
    if (how === "nearest" && group) {
      note = `${describeGroup(group)}. Chosen as the nearest of ${candidates.length} carpet areas in this block, judged by ${currentSqft !== null ? "the carpet area held" : "the room total"}: check it.`;
    }
    const roomsGap =
      rooms !== null && reraSqft !== null
        ? (rooms - reraSqft) / reraSqft
        : null;

    if (reraSqft !== null && (status === "differs" || status === "not_held")) {
      proposed.push(withCarpet(variant, reraSqft));
      changes += 1;
    } else {
      proposed.push(variant);
    }
    return {
      variantName,
      currentSqft,
      reraSqft,
      groupLabel: group ? describeGroup(group) : null,
      how,
      roomsTotalSqft: rooms,
      roomsGap,
      roomsGapFlagged:
        roomsGap !== null && Math.abs(roomsGap) > ROOMS_GAP_FLAG_RATIO,
      status,
      note,
    };
  });

  return {
    groups,
    rows,
    proposedVariants: changes > 0 ? proposed : null,
  };
};
