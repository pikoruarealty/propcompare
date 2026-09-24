import { describe, expect, it } from "vitest";
import { assertNoExcludedData } from "@/lib/properties/no-price";
import type {
  DossierAmenity,
  DossierUnitVariant,
  PropertyDossier,
} from "@/lib/properties/types";
import { richDossierFixture } from "@/lib/properties/fixtures";
import { buildComparison, chooseUnitTypes } from "./model";

let counter = 0;

const variant = (
  name: string,
  bhk: string | null,
  carpet: number | null,
  extra: Partial<DossierUnitVariant> = {},
): DossierUnitVariant => ({
  id: `variant-${(counter += 1)}`,
  variantName: name,
  bhkType: bhk
    ? { key: bhk, label: bhk.toUpperCase().replace("BHK", " BHK") }
    : null,
  layoutType: null,
  unitsPerFloor: null,
  totalUnitsOfVariant: null,
  dimensions: null,
  areas: carpet === null ? [] : [{ basis: "carpet", areaSqft: String(carpet) }],
  ...extra,
});

const amenity = (
  key: string,
  status: DossierAmenity["status"],
): DossierAmenity => ({
  key,
  label: key[0].toUpperCase() + key.slice(1),
  category: "lifestyle",
  status,
});

/** A property built from the rich fixture with everything comparable reset. */
const property = (
  slug: string,
  overrides: Partial<PropertyDossier> = {},
): PropertyDossier => ({
  ...richDossierFixture,
  id: `id-${slug}`,
  slug,
  name: `Tower ${slug.toUpperCase()}`,
  developer: { ...richDossierFixture.developer, name: `Dev ${slug}` },
  possession: {
    status: "under_construction",
    possessionDate: "2028-06-30",
    launchDate: null,
  },
  rera: {
    ...richDossierFixture.rera,
    registered: true,
    registrationNumber: `PR/${slug}`,
    lastCheckedAt: null,
    sourcedFacts: [],
    constructionProgressPercent: null,
  },
  totalTowers: null,
  totalUnits: null,
  unitVariants: [variant("3 BHK", "3bhk", 1200)],
  amenities: [],
  specifications: [],
  media: [],
  ...overrides,
});

const rowOf = (model: ReturnType<typeof buildComparison>, key: string) =>
  model.groups.flatMap((group) => group.rows).find((row) => row.key === key);

describe("choosing the unit type each property is compared on", () => {
  it("compares a BHK type every property offers, the nearest in area to the first property's", () => {
    const a = property("a", {
      unitVariants: [
        variant("2 BHK", "2bhk", 900),
        variant("3 BHK", "3bhk", 1300),
      ],
    });
    const b = property("b", {
      unitVariants: [
        variant("3 BHK small", "3bhk", 1100),
        variant("3 BHK large", "3bhk", 1350),
        variant("4 BHK", "4bhk", 2000),
      ],
    });

    const [first, second] = chooseUnitTypes([a, b]);

    expect(first.variant?.variantName).toBe("3 BHK");
    expect(second.variant?.variantName).toBe("3 BHK large");
    expect(second.by).toBe("bhk");
  });

  it("follows a requested unit type, and everyone else follows its BHK", () => {
    const a = property("a", {
      unitVariants: [
        variant("2 BHK", "2bhk", 900),
        variant("3 BHK", "3bhk", 1300),
      ],
    });
    const b = property("b", {
      unitVariants: [
        variant("2 BHK b", "2bhk", 950),
        variant("3 BHK b", "3bhk", 1250),
      ],
    });
    const asked = a.unitVariants[0].id;

    const [first, second] = chooseUnitTypes([a, b], { a: asked });

    expect(first).toMatchObject({ by: "requested" });
    expect(first.variant?.variantName).toBe("2 BHK");
    expect(second.variant?.variantName).toBe("2 BHK b");
  });

  it("falls back to the nearest carpet area when no BHK is recorded, and to the first type after that", () => {
    const a = property("a", { unitVariants: [variant("Type A", null, 3978)] });
    const b = property("b", {
      unitVariants: [
        variant("Type X", null, 6100),
        variant("Type Y", null, 4000),
      ],
    });
    expect(chooseUnitTypes([a, b])[1]).toMatchObject({ by: "area" });
    expect(chooseUnitTypes([a, b])[1].variant?.variantName).toBe("Type Y");

    const c = property("c", { unitVariants: [variant("Type P", null, null)] });
    expect(chooseUnitTypes([a, c])[1]).toMatchObject({ by: "first" });
  });

  it("compares a property with no unit types on nothing, without failing", () => {
    const empty = property("e", { unitVariants: [] });
    expect(chooseUnitTypes([property("a"), empty])[1]).toEqual({
      variant: null,
      by: "none",
    });
  });
});

describe("the rows", () => {
  const a = property("a", { unitVariants: [variant("3 BHK", "3bhk", 1200)] });
  const b = property("b", { unitVariants: [variant("3 BHK", "3bhk", 1500)] });

  it("marks a differing area, sizes the bars against the largest, and marks the largest", () => {
    const row = rowOf(buildComparison([a, b]), "area_carpet")!;
    expect(row.status).toBe("differs");
    expect(row.cells.map((cell) => cell.text)).toEqual([
      "1,200 sq ft",
      "1,500 sq ft",
    ]);
    expect(row.cells.map((cell) => cell.bar)).toEqual([0.8, 1]);
    expect(row.cells.map((cell) => cell.largest)).toEqual([false, true]);
  });

  it("treats the same figure, within rounding, as the same and marks no largest", () => {
    const close = property("c", {
      unitVariants: [variant("3 BHK", "3bhk", 1200.4)],
    });
    const row = rowOf(buildComparison([a, close]), "area_carpet")!;
    expect(row.status).toBe("same");
    expect(row.cells.some((cell) => cell.largest)).toBe(false);
  });

  it("shows a fact only one side states as a gap, never a difference of value", () => {
    const noDate = property("n", {
      possession: {
        status: "under_construction",
        possessionDate: null,
        launchDate: null,
      },
    });
    const row = rowOf(buildComparison([a, noDate]), "possession_date")!;
    expect(row.status).toBe("gap");
    expect(row.cells[1].state).toBe("not_stated");
  });

  it("leaves out a row nobody has a fact for", () => {
    const model = buildComparison([a, b]);
    expect(rowOf(model, "layout")).toBeUndefined();
    expect(rowOf(model, "area_built_up")).toBeUndefined();
    expect(rowOf(model, "launched")).toBeUndefined();
  });

  it("draws bars for areas and progress only, and rounds progress to one decimal", () => {
    const rera = (progress: string) => ({
      ...richDossierFixture.rera,
      constructionProgressPercent: progress,
      lastCheckedAt: null,
      sourcedFacts: [],
    });
    const p = property("p", { totalUnits: 40, rera: rera("67.71875") });
    const q = property("q", { totalUnits: 120, rera: rera("35") });
    const model = buildComparison([p, q]);
    expect(
      rowOf(model, "construction_progress")!.cells.map((c) => c.text),
    ).toEqual(["67.7%", "35%"]);
    expect(rowOf(model, "construction_progress")!.cells[0].bar).toBe(1);
    expect(rowOf(model, "total_units")!.cells.map((c) => c.bar)).toEqual([
      null,
      null,
    ]);
  });

  it("keeps a fixed group order, so the same fact is in the same place every time", () => {
    expect(buildComparison([a, b]).groups.map((group) => group.key)).toEqual([
      "timeline",
      "unit_type",
      "project",
      "location",
      "trust",
    ]);
  });

  it("compares what is near each project as its own group, one landmark per line, never among the specifications", () => {
    const model = buildComparison([a, b]);
    const location = model.groups.find((group) => group.key === "location");
    expect(location?.rows.map((row) => row.label)).toEqual([
      "Connectivity",
      "Hospitals",
      "Schools and institutions",
    ]);
    const connectivity = location?.rows[0].cells[0];
    expect(connectivity?.text).toBe(
      "Vastrapur Metro Station 1.1 Km\nAirport 16.2 Km",
    );
    const specs = model.groups.find((group) => group.key === "specifications");
    const specKeys = (specs?.rows ?? []).map((row) => row.key).join(" ");
    expect(specKeys).not.toMatch(/nearby/);
  });

  it("shows a printed run of specification items one to a line", () => {
    const withSafety = (valueText: string): PropertyDossier => ({
      ...a,
      specifications: [
        {
          key: "safety_features",
          label: "Safety features",
          category: "building_operation",
          valueText,
          status: "available",
        },
      ],
    });
    const model = buildComparison([
      withSafety("24/7 CCTV; Access control in lobby; Fire sprinklers"),
      withSafety("Gated entry"),
    ]);
    const specs = model.groups.find((group) => group.key === "specifications");
    const row = specs?.rows.find((r) => r.key === "spec_safety_features");

    expect(row?.cells[0].text).toBe(
      "24/7 CCTV\nAccess control in lobby\nFire sprinklers",
    );
    expect(row?.cells[1].text).toBe("Gated entry");
  });

  it("marks rows that are the same, so the screen can show them plainly", () => {
    const model = buildComparison([a, b]);
    const same = model.groups
      .flatMap((g) => g.rows)
      .filter((r) => r.status === "same");
    expect(same.map((row) => row.key)).toContain("configuration");
  });

  it("compares amenities over what any property has a recorded status for, keeping 'not offered' apart from 'not stated'", () => {
    const withAmenities = property("w", {
      amenities: [
        amenity("pool", "available"),
        amenity("gym", "explicitly_not_offered"),
      ],
    });
    const other = property("o", {
      amenities: [amenity("pool", "not_stated"), amenity("gym", "available")],
    });
    const model = buildComparison([withAmenities, other]);
    const pool = rowOf(model, "amenity_pool")!;
    const gym = rowOf(model, "amenity_gym")!;
    expect(pool.cells.map((cell) => cell.state)).toEqual([
      "value",
      "not_stated",
    ]);
    expect(pool.status).toBe("gap");
    expect(gym.cells.map((cell) => cell.state)).toEqual([
      "not_offered",
      "value",
    ]);
  });

  it("carries the regulator-checked marker only for facts the regulator's record stated", () => {
    const checked = property("k", {
      rera: {
        ...richDossierFixture.rera,
        registrationNumber: "PR/k",
        lastCheckedAt: "2026-09-20T06:00:00.000Z",
        sourcedFacts: ["registration_number"],
      },
    });
    const model = buildComparison([checked, property("u")]);
    expect(
      rowOf(model, "rera_number")!.cells.map((cell) => cell.regulatorChecked),
    ).toEqual([true, false]);
    expect(model.columns[0].regulatorCheckedOn).toBe("20 Sep 2026");
    expect(model.columns[1].regulatorCheckedOn).toBeNull();
  });
});

describe("the summary of what changes between the choices", () => {
  const a = property("a", { unitVariants: [variant("3 BHK", "3bhk", 1200)] });
  const b = property("b", { unitVariants: [variant("3 BHK", "3bhk", 1500)] });

  it("states the area difference with both values", () => {
    const line = buildComparison([a, b]).summary.find(
      (l) => l.rowKey === "area_carpet",
    )!;
    expect(line.text).toBe(
      "Tower B has 25% more carpet area than Tower A (1,500 sq ft against 1,200 sq ft).",
    );
  });

  it("states how much earlier a possession date is, only when every property states one", () => {
    const early = property("e", {
      possession: {
        status: "under_construction",
        possessionDate: "2027-04-30",
        launchDate: null,
      },
    });
    const late = property("l", {
      possession: {
        status: "under_construction",
        possessionDate: "2028-06-30",
        launchDate: null,
      },
    });
    expect(
      buildComparison([late, early]).summary.find(
        (l) => l.rowKey === "possession_date",
      )!.text,
    ).toMatch(/^Tower E is due 14 months before Tower L/);
    const unknown = property("x", {
      possession: { status: null, possessionDate: null, launchDate: null },
    });
    expect(
      buildComparison([late, unknown]).summary.some(
        (l) => l.rowKey === "possession_date",
      ),
    ).toBe(false);
  });

  it("says nothing about area when a side does not state carpet area", () => {
    const noArea = property("n", {
      unitVariants: [variant("3 BHK", "3bhk", null)],
    });
    expect(
      buildComparison([a, noArea]).summary.some(
        (l) => l.rowKey === "area_carpet",
      ),
    ).toBe(false);
  });

  it("compares amenity counts only between properties that recorded amenities, so none recorded is not read as none", () => {
    const rich = property("r", {
      amenities: [
        amenity("pool", "available"),
        amenity("gym", "available"),
        amenity("club", "available"),
      ],
    });
    const some = property("s", { amenities: [amenity("gym", "available")] });
    const none = property("z", { amenities: [] });
    expect(
      buildComparison([rich, some]).summary.find(
        (l) => l.rowKey === "amenities",
      )!.text,
    ).toBe(
      "Tower R lists 2 more amenities than Tower S, including Pool, Club.",
    );
    expect(
      buildComparison([rich, none]).summary.some(
        (l) => l.rowKey === "amenities",
      ),
    ).toBe(false);
  });

  it("says whose registration number the regulator's record confirms", () => {
    const checked = property("k", {
      rera: {
        ...richDossierFixture.rera,
        registrationNumber: "PR/k",
        lastCheckedAt: "2026-09-20T00:00:00Z",
        sourcedFacts: ["registration_number"],
      },
    });
    const line = buildComparison([checked, property("u")]).summary.find(
      (l) => l.rowKey === "rera_number",
    )!;
    expect(line.text).toBe(
      "The regulator's record confirms the registration number of Tower K; that of Tower U has not been checked against it.",
    );
  });

  it("is empty when nothing can be stated, and never longer than five lines", () => {
    expect(buildComparison([a, property("same")]).summary).toEqual([]);
    const many = buildComparison([
      property("p", {
        unitVariants: [variant("3 BHK", "3bhk", 1000)],
        amenities: [amenity("pool", "available"), amenity("gym", "available")],
        possession: {
          status: "under_construction",
          possessionDate: "2027-01-31",
          launchDate: null,
        },
        rera: {
          ...richDossierFixture.rera,
          constructionProgressPercent: "80",
          lastCheckedAt: "2026-09-20T00:00:00Z",
          sourcedFacts: ["registration_number"],
          registrationNumber: "PR/p",
        },
      }),
      property("q", {
        unitVariants: [variant("3 BHK", "3bhk", 1500)],
        amenities: [amenity("pool", "available")],
        rera: {
          ...richDossierFixture.rera,
          constructionProgressPercent: "40",
          registrationNumber: "PR/q",
          lastCheckedAt: null,
          sourcedFacts: [],
        },
      }),
    ]);
    expect(many.summary.length).toBeLessThanOrEqual(5);
    expect(many.summary.length).toBeGreaterThanOrEqual(4);
  });
});

describe("what a comparison never carries", () => {
  it("has no price, bucket or review data anywhere in it", () => {
    const model = buildComparison([property("a"), property("b")]);
    expect(() => assertNoExcludedData(model)).not.toThrow();
  });

  it("handles a single property and none without failing", () => {
    expect(buildComparison([]).groups).toEqual([]);
    expect(buildComparison([property("a")]).columns).toHaveLength(1);
  });
});

describe("room by room", () => {
  it("reads a published room name as a kind, and leaves unclear names out", async () => {
    const { roomKind } = await import("./model");
    expect(roomKind("Master Bedroom - 1")).toBe("bedroom");
    expect(roomKind("BED ROOM")).toBe("bedroom");
    expect(roomKind("Drawing / Living / Dining")).toBe("living");
    expect(roomKind("FAMILY ROOM")).toBe("living");
    expect(roomKind("Kitchen")).toBe("kitchen");
    expect(roomKind("VESTIBULE")).toBe("foyer");
    expect(roomKind("COVERED TERRACE")).toBe("balcony");
    // Toilets are tested before "master", so a master toilet is not a bedroom.
    expect(roomKind("M. Dress / Toilet-1")).toBe("toilet");
    expect(roomKind("SER. TOI.")).toBe("toilet");
    expect(roomKind("Servant Room")).toBeNull();
    expect(roomKind("DUCT")).toBeNull();
    expect(roomKind("PUJA")).toBeNull();
  });
});
