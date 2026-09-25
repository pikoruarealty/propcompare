import { describe, expect, it } from "vitest";
import type {
  DossierUnitVariant,
  PropertyDossier,
} from "@/lib/properties/types";
import { richDossierFixture } from "@/lib/properties/fixtures";
import { lockDossier } from "@/lib/properties/lock";
import type { ReraSnapshot } from "@/lib/rera/snapshot";
import { buildComparison } from "./model";

/**
 * The comparison rows that come from what the regulator states (schema v17): open
 * area, availability, lifts, authority, filings, the team, and availability and
 * balcony area for a unit type's carpet area. Every figure is credited to the
 * regulator, and a missing one reads "not stated" and never a number.
 */

const facts = (overrides: Partial<ReraSnapshot> = {}): ReraSnapshot => ({
  version: 1,
  source: "gujrera",
  layoutLandAreaSqm: 7628,
  openAreaSqm: 3131.1,
  coveredAreaSqm: 4496.9,
  coveredParkingAreaSqm: 12553.45,
  filing: {
    quarter: "Q-14",
    periodEndsOn: "2026-06-30",
    source: "quarterly_filing",
    progressPercent: 93.7,
    blocks: [
      { name: "A", progressPercent: 96, floors: 22, lifts: 4, slabs: 24 },
      { name: "B", progressPercent: 95, floors: 21, lifts: 4, slabs: 24 },
    ],
  },
  inventory: {
    totalUnits: 76,
    bookedUnits: 63,
    availableUnits: 13,
    asOn: "2026-07-03",
  },
  filings: { listed: 18, submitted: 17 },
  planPassingAuthority: "AUDA",
  registeredOn: "2022-11-11",
  architects: [{ name: "HM Architects", projectsCompleted: 62 }],
  engineers: [{ name: "Setu Infrastructure", projectsCompleted: null }],
  contractors: [],
  boundary: [],
  centre: null,
  carpetGroups: [
    {
      block: "A",
      carpetAreaSqm: 369.54,
      flatCount: 36,
      firstFlat: "A-301",
      lastFlat: "A-2002",
      bookedCount: 12,
      exclusiveAreaMinSqm: 20.98,
      exclusiveAreaMaxSqm: 36.5,
    },
    {
      block: "B",
      carpetAreaSqm: 369.54,
      flatCount: 36,
      firstFlat: "B-301",
      lastFlat: "B-2002",
      bookedCount: 30,
      exclusiveAreaMinSqm: 20.98,
      exclusiveAreaMaxSqm: 36.5,
    },
  ],
  ...overrides,
});

let counter = 0;
const variant = (name: string, carpet: number | null): DossierUnitVariant => ({
  id: `rera-facts-variant-${(counter += 1)}`,
  variantName: name,
  bhkType: { key: "4bhk", label: "4 BHK" },
  layoutType: null,
  unitsPerFloor: null,
  totalUnitsOfVariant: null,
  dimensions: null,
  areas: carpet === null ? [] : [{ basis: "carpet", areaSqft: String(carpet) }],
  amenities: [],
});

const property = (
  slug: string,
  snapshot: ReraSnapshot | null,
  overrides: Partial<PropertyDossier> = {},
): PropertyDossier => ({
  ...richDossierFixture,
  id: `id-${slug}`,
  slug,
  name: `Tower ${slug.toUpperCase()}`,
  rera: {
    ...richDossierFixture.rera,
    registered: true,
    registrationNumber: `PR/${slug}`,
    lastCheckedAt: null,
    sourcedFacts: [],
    constructionProgressPercent: null,
    projectLandAreaSqft: null,
    facts: snapshot,
  },
  totalUnits: 76,
  plotAreaSqft: null,
  unitVariants: [variant("4 BHK", 3977.7)],
  amenities: [],
  specifications: [],
  media: [],
  ...overrides,
});

const rowOf = (model: ReturnType<typeof buildComparison>, key: string) =>
  model.groups.flatMap((group) => group.rows).find((row) => row.key === key);
const texts = (model: ReturnType<typeof buildComparison>, key: string) =>
  rowOf(model, key)?.cells.map((cell) => cell.text);

describe("project rows from the regulator's facts", () => {
  const model = buildComparison([
    property("a", facts()),
    property(
      "b",
      facts({
        openAreaSqm: 5513.13,
        coveredAreaSqm: 3222.87,
        inventory: {
          totalUnits: 124,
          bookedUnits: 79,
          availableUnits: 45,
          asOn: "2026-07-06",
        },
        planPassingAuthority: "Ahmedabad Municipal Corporation",
      }),
      { totalUnits: 124 },
    ),
  ]);

  it("states open area in square feet and as a share of the whole site", () => {
    expect(texts(model, "open_area")).toEqual([
      "33,703 sq ft, 41% of the site",
      "59,343 sq ft, 63.1% of the site",
    ]);
    expect(rowOf(model, "open_area")?.status).toBe("differs");
    expect(
      rowOf(model, "open_area")?.cells.every((c) => c.regulatorChecked),
    ).toBe(true);
  });

  it("states availability with the date it is as on", () => {
    expect(texts(model, "units_available")).toEqual([
      "13 of 76, as on 3 Jul 2026",
      "45 of 124, as on 6 Jul 2026",
    ]);
  });

  it("adds lifts across blocks and works out units per lift from them", () => {
    expect(texts(model, "lifts")).toEqual(["8", "8"]);
    expect(texts(model, "units_per_lift")).toEqual([
      "9.5 units per lift",
      "15.5 units per lift",
    ]);
    expect(texts(model, "floors_rera")).toEqual(["22", "22"]);
  });

  it("states covered parking and works out slots per unit only from stated inputs", () => {
    const parked = buildComparison([
      property("a", facts({ coveredParkingSlots: 246 })),
      property("b", facts({ coveredParkingSlots: 523 }), { totalUnits: 124 }),
    ]);

    expect(texts(parked, "covered_parking")).toEqual([
      "246 slots",
      "523 slots",
    ]);
    expect(texts(parked, "parking_per_unit")).toEqual([
      "3.2 per unit",
      "4.2 per unit",
    ]);

    const unstated = buildComparison([
      property("a", facts({ coveredParkingSlots: 246 })),
      property("b", facts({ coveredParkingSlots: null })),
    ]);
    expect(rowOf(unstated, "covered_parking")?.status).toBe("gap");
    expect(rowOf(unstated, "parking_per_unit")?.status).toBe("gap");
  });

  it("states the authority, the registration date, filings and the team", () => {
    expect(texts(model, "plan_authority")).toEqual([
      "AUDA",
      "Ahmedabad Municipal Corporation",
    ]);
    expect(texts(model, "registered_on")).toEqual([
      "11 Nov 2022",
      "11 Nov 2022",
    ]);
    expect(texts(model, "filings")).toEqual(["17 of 18", "17 of 18"]);
    expect(texts(model, "architect")?.[0]).toBe("HM Architects (62 projects)");
    // No count stated: the name alone, never "0 projects".
    expect(texts(model, "engineer")?.[0]).toBe("Setu Infrastructure");
    // Nobody states a contractor, so the row is left out rather than shown empty.
    expect(rowOf(model, "contractor")).toBeUndefined();
  });

  it("says a block's lifts are not stated rather than adding what is known", () => {
    const partial = facts({
      filing: {
        ...facts().filing,
        blocks: [
          { name: "A", progressPercent: 96, floors: 22, lifts: 4, slabs: 24 },
          {
            name: "B",
            progressPercent: 95,
            floors: 21,
            lifts: null,
            slabs: 24,
          },
        ],
      },
    });
    const result = buildComparison([
      property("a", partial),
      property("b", facts()),
    ]);

    expect(rowOf(result, "lifts")?.cells[0].state).toBe("not_stated");
    expect(rowOf(result, "units_per_lift")?.cells[0].state).toBe("not_stated");
    expect(rowOf(result, "lifts")?.status).toBe("gap");
  });

  it("reads not stated everywhere for a property with no regulator facts", () => {
    const result = buildComparison([property("a", null), property("b", null)]);

    // A row nobody states is left out of the comparison, not shown as blanks.
    for (const key of [
      "open_area",
      "units_available",
      "lifts",
      "units_per_lift",
      "plan_authority",
      "filings",
      "architect",
    ]) {
      expect(rowOf(result, key)).toBeUndefined();
    }
  });

  it("dates the progress figure when it is the regulator's own filing figure", () => {
    const dated = property("a", facts(), {});
    dated.rera.constructionProgressPercent = "93.72";
    const handEntered = property("b", facts(), {});
    handEntered.rera.constructionProgressPercent = "50.00";

    const result = buildComparison([dated, handEntered]);

    expect(texts(result, "construction_progress")).toEqual([
      "93.7% (to 30 Jun 2026)",
      "50%",
    ]);
  });
});

describe("unit type rows from the regulator's carpet-area groups", () => {
  it("counts the available units of the group that matches the carpet area, across blocks", () => {
    const model = buildComparison([
      property("a", facts()),
      property("b", facts()),
    ]);

    // 12 of 36 booked in A and 30 of 36 in B: 72 flats, 42 booked, 30 available.
    expect(texts(model, "units_available_of_type")).toEqual([
      "30 of 72, as on 3 Jul 2026",
      "30 of 72, as on 3 Jul 2026",
    ]);
    expect(texts(model, "exclusive_area")?.[0]).toBe("226 to 393 sq ft");
  });

  it("keeps to the block a unit type's name names", () => {
    const named = property("a", facts(), {
      unitVariants: [variant("Block A - 3rd Floor", 3977.7)],
    });
    const model = buildComparison([named, property("b", facts())]);

    expect(texts(model, "units_available_of_type")?.[0]).toBe(
      "24 of 36, as on 3 Jul 2026",
    );
  });

  it("offers nothing when no carpet area is held or none of the groups is close", () => {
    const model = buildComparison([
      property("a", facts(), { unitVariants: [variant("4 BHK", null)] }),
      property("b", facts(), { unitVariants: [variant("4 BHK", 2000)] }),
    ]);

    expect(rowOf(model, "units_available_of_type")).toBeUndefined();
    expect(rowOf(model, "exclusive_area")).toBeUndefined();
  });

  it("never counts availability when a group's booked count was not stated", () => {
    const partial = facts();
    partial.carpetGroups = partial.carpetGroups.map((group) => ({
      ...group,
      bookedCount: undefined,
    }));
    const model = buildComparison([
      property("a", partial),
      property("b", facts()),
    ]);

    expect(rowOf(model, "units_available_of_type")?.cells[0].state).toBe(
      "not_stated",
    );
  });
});

describe("what a signed-out visitor receives", () => {
  it("keeps the project's facts and withholds the per-carpet-area groups", () => {
    const locked = lockDossier(property("a", facts()));

    expect(locked.rera.facts?.openAreaSqm).toBe(3131.1);
    expect(locked.rera.facts?.inventory?.availableUnits).toBe(13);
    expect(locked.rera.facts?.carpetGroups).toEqual([]);
  });
});
