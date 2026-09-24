import {
  POSSESSION_STATUS_LABEL,
  formatPossessionDate,
} from "@/lib/properties/browse";
import { identityPicture } from "@/lib/properties/identity-picture";
import {
  AREA_BASIS_LABEL,
  AREA_BASIS_ORDER,
  areasByBasis,
  formatAreaRange,
  formatRoomDimension,
  type RoomDimension,
  formatSqft,
  readRoomDimensions,
  shortUnitTypeName,
  splitListValue,
} from "@/lib/properties/dossier";
import type {
  CatalogItemStatus,
  DossierUnitVariant,
  PossessionStatus,
  PropertyDossier,
} from "@/lib/properties/types";
import type { ReraSourcedFact } from "@/lib/properties/rera-source";
import {
  landAreaOf,
  landAreaText,
  unitsPerAcre,
} from "@/lib/properties/density";
import { blockNamedIn, groupSqft } from "@/lib/rera/carpet-area";
import type { ReraSnapshot } from "@/lib/rera/snapshot";
import { areaToSqft } from "@/lib/units/measurements";

/**
 * The comparison of two or three published properties, as data (specification:
 * `docs/design/comparison.v1.md`).
 *
 * Everything the screen shows is decided here, in pure code, so it is testable and
 * so every comparison uses the same ordered rows: the same fact is in the same
 * place every time.
 *
 * The rules that matter, kept in one file:
 * - **Like for like.** The unit of comparison is a unit type of a property, chosen
 *   by BHK and then by nearest carpet area; areas are compared only on the same
 *   basis and one basis is never derived from another.
 * - **Honest gaps.** A missing fact is `not_stated` (nobody recorded it) or
 *   `not_offered` (the developer said no), never blank, never zero, and never a
 *   difference of value. A row where some sides state a fact and others do not is
 *   a `gap`, shown but not counted as a difference and never used in the summary.
 * - **No price, no score, no winner.** The summary states differences and what each
 *   side has more of, with both values, and nothing is ranked.
 */

export const MAX_COMPARED = 3;

export type CellState = "value" | "not_stated" | "not_offered";

export interface CompareCell {
  state: CellState;
  /** What is shown for a stated value. */
  text: string | null;
  /** For numeric rows: the number, and its size relative to the largest stated
   * value in the row (0 to 1) so a bar can be drawn. */
  number: number | null;
  bar: number | null;
  /** The largest of several different stated numbers in the row. */
  largest: boolean;
  /** The regulator's record stated exactly this value at its last check. */
  regulatorChecked: boolean;
}

export type RowStatus =
  /** Every side states it and the values are the same. */
  | "same"
  /** Every stated side differs from another, and all sides state it. */
  | "differs"
  /** Some sides state it and some do not: shown, never a difference of value. */
  | "gap";

export interface CompareRow {
  key: string;
  label: string;
  cells: CompareCell[];
  status: RowStatus;
  /** The catalog category this row belongs to (amenities and specifications), so the
   * screen can head each run of rows. A label of the vocabulary, not a fact about a
   * property, so a locked model keeps it. */
  category?: string;
}

export type GroupKey =
  | "timeline"
  | "unit_type"
  | "rooms"
  | "project"
  | "amenities"
  | "specifications"
  | "location"
  | "trust";

export interface CompareGroup {
  key: GroupKey;
  title: string;
  rows: CompareRow[];
}

export interface VariantOption {
  id: string;
  name: string;
  shortName: string;
  bhkLabel: string | null;
}

export interface FloorPlanRef {
  id: string;
  caption: string | null;
  attribution: string | null;
}

export interface PhotoRef {
  id: string;
  caption: string | null;
  attribution: string | null;
}

export interface CompareColumn {
  /** The property's id, for saving a comparison. */
  propertyId: string;
  slug: string;
  name: string;
  locality: string;
  city: string;
  developerId: string;
  developerName: string;
  reraRegistered: boolean;
  registrationNumber: string | null;
  regulatorCheckedOn: string | null;
  primaryMediaId: string | null;
  /** The unit type this column compares, or null if the property has none. */
  variant: VariantOption | null;
  variants: VariantOption[];
  /** The floor plans published for the unit type this column compares. */
  floorPlans: FloorPlanRef[];
  /** Every published photo of the project, in listing order, for the photo strip. */
  photos: PhotoRef[];
  /** How the unit type was chosen. */
  variantChosenBy: "requested" | "bhk" | "area" | "first" | "none";
}

export interface SummaryLine {
  rowKey: string;
  text: string;
}

export interface CompareModel {
  columns: CompareColumn[];
  groups: CompareGroup[];
  summary: SummaryLine[];
}

/* ------------------------------------------------------------------ */
/* Choosing the unit type for each property                            */
/* ------------------------------------------------------------------ */

const carpetOf = (variant: DossierUnitVariant): number | null => {
  const value = areasByBasis(variant.areas).carpet;
  const number = value === null ? NaN : Number(value);
  return Number.isFinite(number) ? number : null;
};

/**
 * The floor plans to show for the unit type a column compares: the ones
 * published tied to that exact type, or, when none were tied to it, the
 * plans published tied to no unit type at all (a brochure's plan pages that
 * were never assigned to one). A plan tied to a *different* type is never
 * substituted, so a property with no plan for the chosen type still says so
 * honestly rather than showing the wrong one.
 */
const floorPlansFor = (
  dossier: PropertyDossier,
  variantId: string | null,
): FloorPlanRef[] => {
  if (variantId === null) return [];
  const isPlan = (media: PropertyDossier["media"][number]) =>
    media.mediaType === "floor_plan";
  const tied = dossier.media.filter(
    (media) => isPlan(media) && media.unitVariantId === variantId,
  );
  const untied = dossier.media.filter(
    (media) => isPlan(media) && media.unitVariantId === null,
  );
  const plans = tied.length > 0 ? tied : untied;
  return plans.map((media) => ({
    id: media.id,
    caption: media.caption,
    attribution: media.attribution,
  }));
};

const optionOf = (variant: DossierUnitVariant): VariantOption => ({
  id: variant.id,
  name: variant.variantName,
  shortName: shortUnitTypeName(variant.variantName),
  bhkLabel: variant.bhkType?.label ?? null,
});

const nearestByCarpet = (
  candidates: DossierUnitVariant[],
  target: number | null,
): DossierUnitVariant => {
  if (target === null) return candidates[0];
  let best = candidates[0];
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const carpet = carpetOf(candidate);
    if (carpet === null) continue;
    const distance = Math.abs(carpet - target);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
};

interface Chosen {
  variant: DossierUnitVariant | null;
  by: CompareColumn["variantChosenBy"];
}

/**
 * The unit type each property is compared on. A requested one wins. Otherwise a
 * BHK type every property offers is preferred (a 3 BHK against a 3 BHK), the type
 * of that BHK nearest in carpet area to the first property's; with no shared BHK
 * (or no BHK recorded) the nearest carpet area to the first property's type, and
 * failing that the first type listed.
 */
export const chooseUnitTypes = (
  dossiers: PropertyDossier[],
  requested: Record<string, string | undefined> = {},
): Chosen[] => {
  const asked = dossiers.map((dossier) =>
    dossier.unitVariants.find(
      (variant) => variant.id === requested[dossier.slug],
    ),
  );

  // A BHK type present on every property that has unit types.
  const withTypes = dossiers.filter(
    (dossier) => dossier.unitVariants.length > 0,
  );
  let sharedBhk: string | null = null;
  if (withTypes.length > 1) {
    for (const variant of withTypes[0].unitVariants) {
      const key = variant.bhkType?.key;
      if (
        key &&
        withTypes.every((dossier) =>
          dossier.unitVariants.some((other) => other.bhkType?.key === key),
        )
      ) {
        sharedBhk = key;
        break;
      }
    }
  }

  // The anchor: the first property's requested type, else its type of the shared BHK.
  const first = dossiers[0];
  const anchor: DossierUnitVariant | null =
    asked[0] ??
    (first.unitVariants.length === 0
      ? null
      : (first.unitVariants.find(
          (variant) => variant.bhkType?.key === sharedBhk,
        ) ?? first.unitVariants[0]));
  const anchorCarpet = anchor ? carpetOf(anchor) : null;
  // Everyone else follows the anchor's own BHK type, whatever chose the anchor.
  const targetBhk = anchor?.bhkType?.key ?? null;

  return dossiers.map((dossier, index): Chosen => {
    if (dossier.unitVariants.length === 0) return { variant: null, by: "none" };
    const requestedVariant = asked[index];
    if (requestedVariant) return { variant: requestedVariant, by: "requested" };
    if (index === 0) {
      return {
        variant: anchor,
        by: targetBhk !== null && targetBhk === sharedBhk ? "bhk" : "first",
      };
    }
    const sameBhk = dossier.unitVariants.filter(
      (variant) => targetBhk !== null && variant.bhkType?.key === targetBhk,
    );
    if (sameBhk.length > 0) {
      return { variant: nearestByCarpet(sameBhk, anchorCarpet), by: "bhk" };
    }
    if (
      anchorCarpet !== null &&
      dossier.unitVariants.some((v) => carpetOf(v) !== null)
    ) {
      return {
        variant: nearestByCarpet(dossier.unitVariants, anchorCarpet),
        by: "area",
      };
    }
    return { variant: dossier.unitVariants[0], by: "first" };
  });
};

/* ------------------------------------------------------------------ */
/* Cells and rows                                                      */
/* ------------------------------------------------------------------ */

const NO_CELL = {
  text: null,
  number: null,
  bar: null,
  largest: false,
  regulatorChecked: false,
} as const;

const missing = (state: "not_stated" | "not_offered"): CompareCell => ({
  state,
  ...NO_CELL,
});

const textCell = (
  text: string | null,
  regulatorChecked = false,
): CompareCell =>
  text === null || text.trim() === ""
    ? missing("not_stated")
    : { state: "value", ...NO_CELL, text, regulatorChecked };

const numberCell = (
  number: number | null,
  text: string | null,
  regulatorChecked = false,
): CompareCell =>
  number === null || text === null
    ? missing("not_stated")
    : { state: "value", ...NO_CELL, text, number, regulatorChecked };

const norm = (cell: CompareCell): string | number | null => {
  if (cell.state !== "value") return null;
  if (cell.number !== null) return cell.number;
  return (cell.text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
};

/** Two numbers are the same figure within a rounding tolerance. */
const sameNumber = (a: number, b: number): boolean =>
  Math.abs(a - b) <= Math.max(1, 0.005 * Math.max(Math.abs(a), Math.abs(b)));

const finishRow = (
  key: string,
  label: string,
  cells: CompareCell[],
  options: { numeric?: boolean; category?: string } = {},
): CompareRow => {
  const stated = cells.filter((cell) => cell.state === "value");
  let status: RowStatus;
  if (stated.length < cells.length) {
    status = "gap";
  } else {
    const values = stated.map(norm);
    const allSame = values.every((value) => {
      const other = values[0];
      if (typeof value === "number" && typeof other === "number") {
        return sameNumber(value, other);
      }
      return value === other;
    });
    status = allSame ? "same" : "differs";
  }

  let sized = cells;
  if (options.numeric) {
    const numbers = stated.map((cell) => cell.number as number);
    const max = Math.max(...numbers, 0);
    const distinct = numbers.some((value) => !sameNumber(value, numbers[0]));
    sized = cells.map((cell) =>
      cell.state === "value" && cell.number !== null && max > 0
        ? {
            ...cell,
            bar: cell.number / max,
            largest: distinct && sameNumber(cell.number, max),
          }
        : cell,
    );
  }
  return {
    key,
    label,
    cells: sized,
    status,
    ...(options.category === undefined ? {} : { category: options.category }),
  };
};

const AMENITY_STATE = (status: CatalogItemStatus): CompareCell =>
  status === "available"
    ? { state: "value", ...NO_CELL, text: "Available" }
    : status === "explicitly_not_offered"
      ? missing("not_offered")
      : missing("not_stated");

/* ------------------------------------------------------------------ */
/* The model                                                           */
/* ------------------------------------------------------------------ */

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const shortDate = (iso: string | null): string | null => {
  if (iso === null) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getUTCDate()} ${SHORT_MONTHS[parsed.getUTCMonth()]} ${parsed.getUTCFullYear()}`;
};

const sourced = (dossier: PropertyDossier, fact: ReraSourcedFact): boolean =>
  dossier.rera.lastCheckedAt !== null &&
  dossier.rera.sourcedFacts.includes(fact);

const monthsBetween = (earlier: string, later: string): number => {
  const a = new Date(earlier);
  const b = new Date(later);
  return (
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
    (b.getUTCMonth() - a.getUTCMonth())
  );
};

/** Progress to one decimal: RERA states more digits than mean anything. */
const progressText = (value: string | null): string | null => {
  const number = value === null ? NaN : Number(value);
  return Number.isFinite(number) ? `${Math.round(number * 10) / 10}%` : null;
};

/* ------------------------------------------------------------------ */
/* Measures worked out from stated inputs                              */
/* ------------------------------------------------------------------ */

/*
 * Each of these is arithmetic over facts already held, never a guess: if any input
 * is missing the cell says "not stated", not a smaller or wrong number, and a
 * result that could not be real (an efficiency over 100%) is not shown either. No
 * price, and nothing here ranks a property.
 */

const positiveNumber = (value: string | number | null): number | null => {
  const number = value === null ? NaN : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const oneDecimal = (value: number): string =>
  String(Math.round(value * 10) / 10);

/** Carpet as a share of super built-up area, only when both are stated and the
 * result is possible (carpet is inside super built-up, never larger). */
const efficiencyPercent = (
  variant: DossierUnitVariant | null,
): number | null => {
  if (variant === null) return null;
  const areas = areasByBasis(variant.areas);
  const carpet = positiveNumber(areas.carpet);
  const superBuiltUp = positiveNumber(areas.super_built_up);
  if (carpet === null || superBuiltUp === null || carpet > superBuiltUp) {
    return null;
  }
  return (carpet / superBuiltUp) * 100;
};

/** Every balcony and terrace room's own area, summed (a room's printed area, or its
 * two sides multiplied; `formatRoomDimension` labels the difference), as a share of
 * the unit type's stated carpet area. Owner decision 2026-09-24: carpet, not super
 * built-up. Not stated when there is no balcony room or no carpet area. */
const balconyPercent = (variant: DossierUnitVariant | null): number | null => {
  if (variant === null) return null;
  const carpet = positiveNumber(areasByBasis(variant.areas).carpet);
  const rooms = readRoomDimensions(variant.dimensions);
  if (carpet === null || rooms === null) return null;
  const balconies = rooms.filter((room) => roomKind(room.name) === "balcony");
  if (balconies.length === 0) return null;
  const area = balconies.reduce(
    (total, room) => total + (room.areaSqft ?? room.lengthFt * room.widthFt),
    0,
  );
  return area > 0 ? (area / carpet) * 100 : null;
};

/* ------------------------------------------------------------------ */
/* What the regulator states (schema v17 snapshot)                     */
/* ------------------------------------------------------------------ */

/*
 * Every figure here is the regulator's, with the quarter or date it is as on, so
 * each cell is credited to it. A figure the record does not state is "not stated",
 * never zero, and the arithmetic (share of the site, units per lift) is done only
 * when every input is stated.
 */

const sqmText = (sqm: number): string =>
  `${formatSqft(String(Math.round(areaToSqft(sqm, "sqm"))))} sq ft`;

/** Open area as a share of the whole site: open plus covered, else the layout land. */
const openAreaShare = (facts: ReraSnapshot): number | null => {
  if (facts.openAreaSqm === null) return null;
  const whole =
    facts.coveredAreaSqm !== null
      ? facts.openAreaSqm + facts.coveredAreaSqm
      : facts.layoutLandAreaSqm;
  return whole !== null && whole > 0 ? (facts.openAreaSqm / whole) * 100 : null;
};

/** Lifts across the blocks, only when every block states its own. */
const liftsTotal = (facts: ReraSnapshot): number | null => {
  const blocks = facts.filing.blocks;
  if (blocks.length === 0 || blocks.some((block) => block.lifts === null)) {
    return null;
  }
  return blocks.reduce((sum, block) => sum + (block.lifts as number), 0);
};

/** The most floors any block states: a block can hold several towers, so this is
 * the regulator's count and is labelled as such. */
const floorsMostStated = (facts: ReraSnapshot): number | null => {
  const floors = facts.filing.blocks
    .map((block) => block.floors)
    .filter((value): value is number => value !== null);
  return floors.length === 0 ? null : Math.max(...floors);
};

/** The regulator's carpet-area groups that belong to a unit type: within a square
 * foot of its stated carpet area, and in its block when its name names one. */
const carpetGroupsFor = (
  facts: ReraSnapshot,
  variant: DossierUnitVariant | null,
) => {
  if (variant === null) return [];
  const carpet = positiveNumber(areasByBasis(variant.areas).carpet);
  if (carpet === null) return [];
  const block = blockNamedIn(variant.variantName);
  return facts.carpetGroups.filter(
    (group) =>
      (block === null || group.block === block) &&
      Math.abs(groupSqft(group) - carpet) <= 1,
  );
};

const partyText = (
  parties: { name: string; projectsCompleted: number | null }[],
): string | null =>
  parties.length === 0
    ? null
    : parties
        .map((party) =>
          party.projectsCompleted === null
            ? party.name
            : `${party.name} (${party.projectsCompleted} projects)`,
        )
        .join("\n");

/** Progress with the period it is to, when it is the regulator's own filing figure
 * (a hand-entered figure that differs is not credited to a quarter). */
const progressLabel = (dossier: PropertyDossier): string | null => {
  const base = progressText(dossier.rera.constructionProgressPercent);
  const filing = dossier.rera.facts?.filing;
  if (
    base === null ||
    !filing ||
    filing.source !== "quarterly_filing" ||
    !filing.periodEndsOn ||
    filing.progressPercent === null ||
    Math.abs(
      Number(dossier.rera.constructionProgressPercent) - filing.progressPercent,
    ) > 0.05
  ) {
    return base;
  }
  return `${base} (to ${shortDate(filing.periodEndsOn)})`;
};

/* ------------------------------------------------------------------ */
/* Rooms, compared by kind                                             */
/* ------------------------------------------------------------------ */

export type RoomKind =
  "bedroom" | "living" | "kitchen" | "foyer" | "toilet" | "balcony";

/**
 * A published room name, read as a kind of room. Only a name that clearly says
 * what the room is gets a kind; anything else (a duct, a store, a puja) is left
 * out of the room-by-room rows, never guessed. Toilets and dressing rooms are
 * tested first because "Master dress / toilet" also contains "master".
 */
export const roomKind = (name: string): RoomKind | null => {
  const n = name.toLowerCase();
  if (/\b(toi|toilet|wc|wash ?room|bath|powder)/.test(n)) return "toilet";
  if (/dress/.test(n)) return null;
  if (/bed\s*room|\bbed\b|master/.test(n) && !/servant|ser\./.test(n)) {
    return "bedroom";
  }
  if (/living|drawing|dining|family|lounge/.test(n)) return "living";
  if (/kitchen|pantry/.test(n)) return "kitchen";
  if (/foyer|vestibule|entry|entrance|lobby/.test(n)) return "foyer";
  if (/balcon|terrace|deck|sit.?out|verandah/.test(n)) return "balcony";
  return null;
};

const ROOM_ROWS: { kind: RoomKind; label: string }[] = [
  { kind: "bedroom", label: "Bedrooms" },
  { kind: "living", label: "Living, drawing and dining" },
  { kind: "kitchen", label: "Kitchen" },
  { kind: "foyer", label: "Foyer and vestibule" },
  { kind: "balcony", label: "Balconies and terraces" },
  { kind: "toilet", label: "Toilets" },
];

const bySize = (a: RoomDimension, b: RoomDimension) =>
  b.lengthFt * b.widthFt - a.lengthFt * a.widthFt;

/**
 * The rooms of one kind as published, one per line (largest first): sides as
 * stated, each beside its own area (its printed area, or the sides multiplied
 * together and labelled as calculated — `formatRoomDimension`). Lines render
 * with `white-space: pre-line` in the screen, so a room row is never one long
 * semicolon-joined line.
 */
const roomsText = (rooms: RoomDimension[]): string =>
  [...rooms]
    .sort(bySize)
    .map((room) => formatRoomDimension(room))
    .join("\n");

/**
 * Rooms whose name does not clearly say what kind of room it is (a dress, a
 * store, a puja, a servant room, a duct) are never guessed into one of the
 * kinds above, but they are still published facts, so they get their own row,
 * named as printed, rather than being silently dropped.
 */
const otherRoomsText = (rooms: RoomDimension[]): string =>
  [...rooms]
    .sort(bySize)
    .map((room) => `${room.name}: ${formatRoomDimension(room)}`)
    .join("\n");

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/**
 * Possession status is filled in when nobody confirmed one but RERA's declared
 * progress is on record, using the same rule the admin RERA panel already
 * states and labels as derived (`src/lib/rera/mapping.ts`): progress under 100
 * is under construction, 100 is ready to move. A confirmed status always wins;
 * this only fills a genuine gap, never overrides a stated value, and is never
 * marked as something the regulator itself said (`sourced` stays false for it,
 * as `DECISIONS.md` 2026-09-20 already requires).
 */
const displayPossessionStatus = (
  dossier: PropertyDossier,
): PossessionStatus | null => {
  if (dossier.possession.status !== null) return dossier.possession.status;
  const progress = Number(dossier.rera.constructionProgressPercent);
  if (!Number.isFinite(progress)) return null;
  return progress >= 100 ? "ready_to_move" : "under_construction";
};

/**
 * A property with a registration number on record is registered, whether or
 * not the `rera_registered` flag was separately confirmed: the number is the
 * fact, the flag is bookkeeping that can lag it.
 */
const displayReraRegistered = (dossier: PropertyDossier): boolean =>
  dossier.rera.registered || dossier.rera.registrationNumber !== null;

export const buildComparison = (
  dossiers: PropertyDossier[],
  requested: Record<string, string | undefined> = {},
): CompareModel => {
  if (dossiers.length === 0) {
    return { columns: [], groups: [], summary: [] };
  }
  const chosen = chooseUnitTypes(dossiers, requested);

  const columns: CompareColumn[] = dossiers.map((dossier, i) => ({
    propertyId: dossier.id,
    slug: dossier.slug,
    name: dossier.name,
    locality: dossier.location.locality,
    city: dossier.location.city,
    developerId: dossier.developer.id,
    developerName: dossier.developer.name,
    reraRegistered: displayReraRegistered(dossier),
    registrationNumber: dossier.rera.registrationNumber,
    regulatorCheckedOn: shortDate(dossier.rera.lastCheckedAt),
    primaryMediaId: identityPicture(dossier.media)?.id ?? null,
    variant: chosen[i].variant ? optionOf(chosen[i].variant) : null,
    floorPlans: floorPlansFor(dossier, chosen[i].variant?.id ?? null),
    photos: dossier.media
      .filter((media) => media.mediaType === "photo")
      .map(({ id, caption, attribution }) => ({ id, caption, attribution })),
    variants: dossier.unitVariants.map(optionOf),
    variantChosenBy: chosen[i].by,
  }));

  const row = (
    key: string,
    label: string,
    pick: (
      dossier: PropertyDossier,
      variant: DossierUnitVariant | null,
    ) => CompareCell,
    options?: { numeric?: boolean; category?: string },
  ) =>
    finishRow(
      key,
      label,
      dossiers.map((dossier, i) => pick(dossier, chosen[i].variant)),
      options,
    );

  const groups: CompareGroup[] = [];

  groups.push({
    key: "timeline",
    title: "Possession and timeline",
    rows: [
      row("possession_status", "Possession", (d) => {
        const status = displayPossessionStatus(d);
        return textCell(status ? POSSESSION_STATUS_LABEL[status] : null);
      }),
      row("possession_date", "Possession date", (d) =>
        textCell(
          formatPossessionDate(d.possession.possessionDate),
          sourced(d, "possession_date"),
        ),
      ),
      row(
        "construction_progress",
        "Construction progress",
        (d) =>
          numberCell(
            d.rera.constructionProgressPercent === null
              ? null
              : Number(d.rera.constructionProgressPercent),
            progressLabel(d),
            sourced(d, "construction_progress"),
          ),
        { numeric: true },
      ),
      row("launched", "Launched", (d) =>
        textCell(formatPossessionDate(d.possession.launchDate)),
      ),
    ],
  });

  const unitRows: CompareRow[] = [
    row("configuration", "Configuration", (_d, v) =>
      textCell(v?.bhkType?.label ?? null),
    ),
    row("layout", "Layout", (_d, v) => textCell(v?.layoutType?.label ?? null)),
  ];
  for (const basis of AREA_BASIS_ORDER) {
    unitRows.push(
      row(
        `area_${basis}`,
        AREA_BASIS_LABEL[basis],
        (_d, v) => {
          const raw = v ? areasByBasis(v.areas)[basis] : null;
          const number = raw === null ? NaN : Number(raw);
          const text = formatSqft(raw);
          return numberCell(
            Number.isFinite(number) ? number : null,
            text === null ? null : `${text} sq ft`,
          );
        },
        { numeric: true },
      ),
    );
  }
  unitRows.push(
    row("units_of_type", "Units of this type", (_d, v) =>
      numberCell(
        v?.totalUnitsOfVariant ?? null,
        v?.totalUnitsOfVariant == null ? null : String(v.totalUnitsOfVariant),
      ),
    ),
  );
  unitRows.push(
    row("units_per_floor", "Units per floor", (_d, v) =>
      numberCell(
        v?.unitsPerFloor ?? null,
        v?.unitsPerFloor == null ? null : String(v.unitsPerFloor),
      ),
    ),
    row(
      "efficiency",
      "Efficiency (carpet share of super built-up)",
      (_d, v) => {
        const percent = efficiencyPercent(v);
        return numberCell(
          percent === null ? null : Math.round(percent * 10) / 10,
          percent === null ? null : `${oneDecimal(percent)}%`,
        );
      },
      { numeric: true },
    ),
    row(
      "balcony_ratio",
      "Balcony area (share of carpet area)",
      (_d, v) => {
        const percent = balconyPercent(v);
        return numberCell(
          percent === null ? null : Math.round(percent * 10) / 10,
          percent === null ? null : `${oneDecimal(percent)}%`,
        );
      },
      { numeric: true },
    ),
    row(
      "units_available_of_type",
      "Units of this type available",
      (d, v) => {
        const facts = d.rera.facts;
        const matched = facts ? carpetGroupsFor(facts, v) : [];
        if (
          matched.length === 0 ||
          matched.some((group) => group.bookedCount === undefined)
        ) {
          return textCell(null);
        }
        const flats = matched.reduce((sum, group) => sum + group.flatCount, 0);
        const booked = matched.reduce(
          (sum, group) => sum + (group.bookedCount ?? 0),
          0,
        );
        const asOn = shortDate(facts?.inventory?.asOn ?? null);
        return numberCell(
          flats - booked,
          `${flats - booked} of ${flats}${asOn ? `, as on ${asOn}` : ""}`,
          true,
        );
      },
      { numeric: true },
    ),
    row("exclusive_area", "Balcony and open terrace (RERA)", (d, v) => {
      const facts = d.rera.facts;
      const matched = facts ? carpetGroupsFor(facts, v) : [];
      const mins = matched
        .map((group) => group.exclusiveAreaMinSqm)
        .filter((value): value is number => value !== undefined);
      const maxes = matched
        .map((group) => group.exclusiveAreaMaxSqm)
        .filter((value): value is number => value !== undefined);
      if (mins.length === 0 || maxes.length === 0) return textCell(null);
      const low = Math.min(...mins);
      const high = Math.max(...maxes);
      return textCell(
        Math.round(areaToSqft(low, "sqm")) ===
          Math.round(areaToSqft(high, "sqm"))
          ? sqmText(low)
          : `${formatSqft(String(Math.round(areaToSqft(low, "sqm"))))} to ${sqmText(high)}`,
        true,
      );
    }),
  );
  groups.push({ key: "unit_type", title: "The unit type", rows: unitRows });

  groups.push({
    key: "rooms",
    title: "Room by room",
    rows: [
      ...ROOM_ROWS.map(({ kind, label }) =>
        row(`rooms_${kind}`, label, (_d, v) => {
          const rooms = v ? readRoomDimensions(v.dimensions) : null;
          if (rooms === null) return textCell(null);
          const ofKind = rooms.filter((room) => roomKind(room.name) === kind);
          if (ofKind.length === 0) return textCell(null);
          return textCell(roomsText(ofKind));
        }),
      ),
      row("rooms_other", "Other rooms", (_d, v) => {
        const rooms = v ? readRoomDimensions(v.dimensions) : null;
        if (rooms === null) return textCell(null);
        const unclassified = rooms.filter(
          (room) => roomKind(room.name) === null,
        );
        if (unclassified.length === 0) return textCell(null);
        return textCell(otherRoomsText(unclassified));
      }),
    ],
  });

  groups.push({
    key: "project",
    title: "The project",
    rows: [
      row("property_type", "Type", (d) => textCell(d.propertyType.label)),
      row("developer", "Developer", (d) => textCell(d.developer.name)),
      row("architect", "Architect", (d) =>
        textCell(partyText(d.rera.facts?.architects ?? []), true),
      ),
      row("engineer", "Structural engineer", (d) =>
        textCell(partyText(d.rera.facts?.engineers ?? []), true),
      ),
      row("contractor", "Contractor", (d) =>
        textCell(partyText(d.rera.facts?.contractors ?? []), true),
      ),
      row("locality", "Locality", (d) => textCell(d.location.locality)),
      row("city", "City", (d) => textCell(d.location.city)),
      row("pincode", "Pincode", (d) => textCell(d.location.pincode)),
      row("towers", "Towers", (d) =>
        numberCell(
          d.totalTowers,
          d.totalTowers === null ? null : String(d.totalTowers),
        ),
      ),
      row("floors", "Floors", (d) =>
        numberCell(
          d.totalFloors,
          d.totalFloors === null ? null : String(d.totalFloors),
        ),
      ),
      row("total_units", "Units in the project", (d) =>
        numberCell(
          d.totalUnits,
          d.totalUnits === null ? null : String(d.totalUnits),
          sourced(d, "total_units"),
        ),
      ),
      row(
        "land_area",
        "Land area",
        (d) => {
          const land = landAreaOf(d);
          return numberCell(
            land === null ? null : land.sqft,
            land === null ? null : landAreaText(land),
          );
        },
        { numeric: true },
      ),
      row(
        "units_per_acre",
        "Density",
        (d) => {
          const density = unitsPerAcre(d);
          return numberCell(
            density === null ? null : Math.round(density.perAcre * 10) / 10,
            density === null
              ? null
              : `${oneDecimal(density.perAcre)} units per acre${density.fromRera ? " (land area per RERA)" : ""}`,
          );
        },
        { numeric: true },
      ),
      row(
        "open_area",
        "Open area",
        (d) => {
          const facts = d.rera.facts;
          const share = facts ? openAreaShare(facts) : null;
          return numberCell(
            share === null ? null : Math.round(share * 10) / 10,
            facts === null || facts.openAreaSqm === null || share === null
              ? null
              : `${sqmText(facts.openAreaSqm)}, ${oneDecimal(share)}% of the site`,
            true,
          );
        },
        { numeric: true },
      ),
      row(
        "units_available",
        "Units available",
        (d) => {
          const inventory = d.rera.facts?.inventory;
          if (
            !inventory ||
            inventory.availableUnits === null ||
            inventory.totalUnits === null
          ) {
            return textCell(null);
          }
          const asOn = shortDate(inventory.asOn);
          return numberCell(
            inventory.availableUnits,
            `${inventory.availableUnits} of ${inventory.totalUnits}${asOn ? `, as on ${asOn}` : ""}`,
            true,
          );
        },
        { numeric: true },
      ),
      row(
        "lifts",
        "Lifts",
        (d) => {
          const lifts = d.rera.facts ? liftsTotal(d.rera.facts) : null;
          return numberCell(lifts, lifts === null ? null : String(lifts), true);
        },
        { numeric: true },
      ),
      row(
        "units_per_lift",
        "Units per lift (calculated)",
        (d) => {
          const lifts = d.rera.facts ? liftsTotal(d.rera.facts) : null;
          const units = positiveNumber(
            d.totalUnits ?? d.rera.facts?.inventory?.totalUnits ?? null,
          );
          if (lifts === null || lifts <= 0 || units === null) {
            return textCell(null);
          }
          const perLift = units / lifts;
          return numberCell(
            Math.round(perLift * 10) / 10,
            `${oneDecimal(perLift)} units per lift`,
            true,
          );
        },
        { numeric: true },
      ),
      row(
        "covered_parking",
        "Covered parking (RERA)",
        (d) => {
          const slots = positiveNumber(
            d.rera.facts?.coveredParkingSlots ?? null,
          );
          return numberCell(
            slots,
            slots === null ? null : `${slots} slots`,
            true,
          );
        },
        { numeric: true },
      ),
      row(
        "parking_per_unit",
        "Covered parking per unit (calculated)",
        (d) => {
          const slots = positiveNumber(
            d.rera.facts?.coveredParkingSlots ?? null,
          );
          const units = positiveNumber(
            d.totalUnits ?? d.rera.facts?.inventory?.totalUnits ?? null,
          );
          if (slots === null || units === null) return textCell(null);
          const perUnit = slots / units;
          return numberCell(
            Math.round(perUnit * 10) / 10,
            `${oneDecimal(perUnit)} per unit`,
            true,
          );
        },
        { numeric: true },
      ),
      row(
        "floors_rera",
        "Floors (per RERA)",
        (d) => {
          const floors = d.rera.facts ? floorsMostStated(d.rera.facts) : null;
          return numberCell(
            floors,
            floors === null ? null : String(floors),
            true,
          );
        },
        { numeric: true },
      ),
      row("plan_authority", "Plans passed by", (d) =>
        textCell(d.rera.facts?.planPassingAuthority ?? null, true),
      ),
      row("registered_on", "RERA registered on", (d) =>
        textCell(shortDate(d.rera.facts?.registeredOn ?? null), true),
      ),
      row("filings", "Regulator filings submitted", (d) => {
        const filings = d.rera.facts?.filings;
        return filings
          ? textCell(`${filings.submitted} of ${filings.listed}`, true)
          : textCell(null);
      }),
      row(
        "developer_completed",
        "Developer's completed projects listed here",
        (d) =>
          numberCell(
            d.developer.completedProjectsCount,
            String(d.developer.completedProjectsCount),
          ),
      ),
    ],
  });

  // Amenities: the union of what any compared property has a recorded status for.
  const amenityKeys = new Map<string, { label: string; category: string }>();
  for (const dossier of dossiers) {
    for (const amenity of dossier.amenities) {
      if (amenity.status !== "not_stated") {
        amenityKeys.set(amenity.key, {
          label: amenity.label,
          category: amenity.category,
        });
      }
    }
  }
  groups.push({
    key: "amenities",
    title: "Amenities",
    rows: [...amenityKeys.entries()]
      .sort(
        (a, b) =>
          a[1].category.localeCompare(b[1].category) ||
          a[1].label.localeCompare(b[1].label),
      )
      .map(([key, meta]) =>
        row(
          `amenity_${key}`,
          meta.label,
          (d) => {
            const found = d.amenities.find((amenity) => amenity.key === key);
            return AMENITY_STATE(found?.status ?? "not_stated");
          },
          { category: meta.category },
        ),
      ),
  });

  // What is near each project (schema v12 location facts, kept out of the
  // specifications): one row per kind, each landmark on its own line.
  const nearbyRows: {
    key: string;
    label: string;
    pick: (d: PropertyDossier) => string[];
  }[] = [
    {
      key: "nearby_connectivity",
      label: "Connectivity",
      pick: (d) => d.location.nearby.connectivity,
    },
    {
      key: "nearby_hospitals",
      label: "Hospitals",
      pick: (d) => d.location.nearby.hospitals,
    },
    {
      key: "nearby_schools",
      label: "Schools and institutions",
      pick: (d) => d.location.nearby.schools,
    },
  ];
  const statedNearby = nearbyRows.filter((entry) =>
    dossiers.some((d) => entry.pick(d).length > 0),
  );
  if (statedNearby.length > 0) {
    groups.push({
      key: "location",
      title: "Location and connectivity",
      rows: statedNearby.map((entry) =>
        row(entry.key, entry.label, (d) => {
          const items = entry.pick(d);
          return textCell(items.length > 0 ? items.join("\n") : null);
        }),
      ),
    });
  }

  const specKeys = new Map<string, { label: string; category: string }>();
  for (const dossier of dossiers) {
    for (const spec of dossier.specifications) {
      if (spec.status !== "not_stated") {
        specKeys.set(spec.key, { label: spec.label, category: spec.category });
      }
    }
  }
  groups.push({
    key: "specifications",
    title: "Specifications",
    rows: [...specKeys.entries()]
      .sort(
        (a, b) =>
          a[1].category.localeCompare(b[1].category) ||
          a[1].label.localeCompare(b[1].label),
      )
      .map(([key, meta]) =>
        row(
          `spec_${key}`,
          meta.label,
          (d) => {
            const found = d.specifications.find((spec) => spec.key === key);
            if (!found) return missing("not_stated");
            if (found.status === "explicitly_not_offered")
              return missing("not_offered");
            // A printed run of items ("A; B; C") is one item to a line.
            return textCell(
              splitListValue(found.valueText)?.join("\n") ?? found.valueText,
            );
          },
          { category: meta.category },
        ),
      ),
  });

  groups.push({
    key: "trust",
    title: "RERA",
    rows: [
      row("rera_registration", "Registration", (d) =>
        textCell(displayReraRegistered(d) ? "Registered" : null),
      ),
      row("rera_number", "Registration number", (d) =>
        textCell(d.rera.registrationNumber, sourced(d, "registration_number")),
      ),
      row("rera_land_area", "Registered land area", (d) => {
        const text = formatSqft(d.rera.projectLandAreaSqft);
        return textCell(text === null ? null : `${text} sq ft`);
      }),
      row("rera_carpet_range", "RERA carpet area range", (d) =>
        textCell(
          formatAreaRange(
            d.rera.carpetAreaRangeMinSqft,
            d.rera.carpetAreaRangeMaxSqft,
          ),
        ),
      ),
    ],
  });

  // A row nobody has a fact for says nothing, so it is not shown.
  const shown = groups
    .map((group) => ({
      ...group,
      rows: group.rows.filter((candidate) =>
        candidate.cells.some((cell) => cell.state !== "not_stated"),
      ),
    }))
    .filter(
      (group) =>
        group.rows.length > 0 ||
        // Floor plans are drawn beside the rows, so a plan alone keeps the group.
        (group.key === "rooms" && columns.some((c) => c.floorPlans.length > 0)),
    );

  return {
    columns,
    groups: shown,
    summary: buildSummary(dossiers, columns, shown),
  };
};

/* ------------------------------------------------------------------ */
/* "If you choose A over B": stated differences only                   */
/* ------------------------------------------------------------------ */

const findRow = (groups: CompareGroup[], key: string): CompareRow | undefined =>
  groups
    .flatMap((group) => group.rows)
    .find((candidate) => candidate.key === key);

const buildSummary = (
  dossiers: PropertyDossier[],
  columns: CompareColumn[],
  groups: CompareGroup[],
): SummaryLine[] => {
  const lines: SummaryLine[] = [];
  const name = (i: number) => columns[i].name;

  // Space: carpet area, only when every property states it and they differ.
  const carpet = findRow(groups, "area_carpet");
  if (carpet && carpet.status === "differs") {
    const numbers = carpet.cells.map((cell) => cell.number as number);
    const high = numbers.indexOf(Math.max(...numbers));
    const low = numbers.indexOf(Math.min(...numbers));
    const percent = Math.round(
      ((numbers[high] - numbers[low]) / numbers[low]) * 100,
    );
    if (percent >= 2) {
      lines.push({
        rowKey: "area_carpet",
        text: `${name(high)} has ${percent}% more carpet area than ${name(low)} (${carpet.cells[high].text} against ${carpet.cells[low].text}).`,
      });
    }
  }

  // Timeline: possession dates, only when every property states one.
  if (dossiers.every((d) => d.possession.possessionDate !== null)) {
    const dates = dossiers.map((d) => d.possession.possessionDate as string);
    const earliest = dates.indexOf([...dates].sort()[0]);
    const latest = dates.indexOf([...dates].sort().slice(-1)[0]);
    const months = monthsBetween(dates[earliest], dates[latest]);
    if (months >= 1) {
      lines.push({
        rowKey: "possession_date",
        text: `${name(earliest)} is due ${plural(months, "month")} before ${name(latest)} (${formatPossessionDate(dates[earliest])} against ${formatPossessionDate(dates[latest])}).`,
      });
    }
  }

  // Progress on site, only when every property declares it.
  const progress = findRow(groups, "construction_progress");
  if (progress && progress.status === "differs") {
    const numbers = progress.cells.map((cell) => cell.number as number);
    const high = numbers.indexOf(Math.max(...numbers));
    const low = numbers.indexOf(Math.min(...numbers));
    if (numbers[high] - numbers[low] >= 5) {
      lines.push({
        rowKey: "construction_progress",
        text: `${name(high)} reports more construction progress: ${progress.cells[high].text} against ${progress.cells[low].text} for ${name(low)}.`,
      });
    }
  }

  // Amenities: only among properties that recorded any amenity at all, so a
  // property with none recorded is not read as having none.
  const recorded = dossiers.map((d) =>
    d.amenities.some((a) => a.status !== "not_stated"),
  );
  if (recorded.every(Boolean)) {
    const offered = dossiers.map(
      (d) =>
        new Set(
          d.amenities
            .filter((a) => a.status === "available")
            .map((a) => a.label),
        ),
    );
    const most = offered.reduce(
      (best, set, i) => (set.size > offered[best].size ? i : best),
      0,
    );
    for (let other = 0; other < dossiers.length; other += 1) {
      if (other === most) continue;
      const extra = [...offered[most]].filter(
        (label) => !offered[other].has(label),
      );
      if (extra.length >= 1 && offered[most].size > offered[other].size) {
        const shown = extra.slice(0, 3).join(", ");
        lines.push({
          rowKey: "amenities",
          text: `${name(most)} lists ${plural(offered[most].size - offered[other].size, "more amenity", "more amenities")} than ${name(other)}, including ${shown}${extra.length > 3 ? " and others" : ""}.`,
        });
        break;
      }
    }
  }

  // Trust: whose registration number the regulator's record confirms.
  const checked = dossiers.map((d) => sourced(d, "registration_number"));
  if (checked.some(Boolean) && !checked.every(Boolean)) {
    const yes = checked.flatMap((value, i) => (value ? [name(i)] : []));
    const no = checked.flatMap((value, i) => (value ? [] : [name(i)]));
    lines.push({
      rowKey: "rera_number",
      text: `The regulator's record confirms the registration number of ${yes.join(" and ")}; that of ${no.join(" and ")} has not been checked against it.`,
    });
  }

  return lines.slice(0, 5);
};
