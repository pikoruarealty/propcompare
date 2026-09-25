import { describe, expect, it } from "vitest";
import {
  AREA_BASIS_ORDER,
  areasByBasis,
  dossierBhkLabels,
  dossierJsonLd,
  dossierMetadata,
  formatAreaRange,
  formatPercent,
  formatRoomDimension,
  formatSqft,
  groupByCategory,
  humaniseCategory,
  readRoomDimensions,
  dossierFactCount,
  splitAmenitiesFullList,
  splitLandmarks,
  splitListValue,
  splitNearbyFacts,
} from "./dossier";
import { richDossierFixture, sparseDossierFixture } from "./fixtures";
import { findForbiddenKeys } from "./no-price";

/**
 * The dossier's presentation rules, tested where they live rather than through
 * the rendered page. Two of them are the load-bearing ones: an absent area
 * basis is never derived from a present one, and the opaque `dimensions` blob
 * is only rendered where it can actually be read.
 */

describe("areasByBasis", () => {
  it("keys published areas by their basis", () => {
    const areas = areasByBasis([
      { basis: "carpet", areaSqft: "985.00" },
      { basis: "super_built_up", areaSqft: "1425.00" },
    ]);

    expect(areas.carpet).toBe("985.00");
    expect(areas.super_built_up).toBe("1425.00");
  });

  it("never derives an unpublished basis from a published one", () => {
    // Carpet area is not a fixed ratio of super built-up area; the ratio varies
    // by developer and project. A computed number sitting beside published ones
    // is indistinguishable from a fact.
    const areas = areasByBasis([{ basis: "carpet", areaSqft: "985.00" }]);

    expect(areas.built_up).toBeNull();
    expect(areas.super_built_up).toBeNull();
  });

  it("reports every basis, so a partial record cannot read as a complete one", () => {
    const areas = areasByBasis([]);

    expect(Object.keys(areas).sort()).toEqual([...AREA_BASIS_ORDER].sort());
    expect(Object.values(areas)).toEqual([null, null, null]);
  });
});

describe("formatSqft", () => {
  it("groups thousands", () => {
    expect(formatSqft("1425.00")).toBe("1,425");
    expect(formatSqft("48000.00")).toBe("48,000");
  });

  it("drops a scale nobody published, but keeps a stated fraction", () => {
    expect(formatSqft("985.00")).toBe("985");
    expect(formatSqft("985.50")).toBe("985.5");
  });

  it("returns null rather than printing something malformed", () => {
    for (const value of ["", "abc", "1,425", "1e3", null]) {
      expect(formatSqft(value)).toBeNull();
    }
  });
});

describe("formatPercent", () => {
  it("renders a published progress figure", () => {
    expect(formatPercent("42.50")).toBe("42.5%");
  });

  it("returns null when nothing was published", () => {
    expect(formatPercent(null)).toBeNull();
  });
});

describe("formatAreaRange", () => {
  it("renders both bounds when both are published", () => {
    expect(formatAreaRange("985.00", "1640.00")).toBe("985–1,640 sq ft");
  });

  it("does not pair a published bound with an invented one", () => {
    expect(formatAreaRange("985.00", null)).toBe("From 985 sq ft");
    expect(formatAreaRange(null, "1640.00")).toBe("Up to 1,640 sq ft");
  });

  it("returns null when neither bound is published", () => {
    expect(formatAreaRange(null, null)).toBeNull();
  });
});

describe("groupByCategory", () => {
  it("groups while preserving the order rows arrived in", () => {
    const groups = groupByCategory([
      { category: "lifestyle", key: "a" },
      { category: "utility", key: "b" },
      { category: "lifestyle", key: "c" },
    ]);

    expect(groups.map((group) => group.category)).toEqual([
      "lifestyle",
      "utility",
    ]);
    expect(groups[0]!.items.map((item) => item.key)).toEqual(["a", "c"]);
  });

  it("keeps rows of every status", () => {
    // A category whose amenities are all unrecorded still renders: "nobody has
    // said whether this project has a clubhouse" is information too.
    const groups = groupByCategory(sparseDossierFixture.amenities);

    expect(groups.flatMap((group) => group.items)).toHaveLength(
      sparseDossierFixture.amenities.length,
    );
  });
});

describe("humaniseCategory", () => {
  it("turns a catalog key into a heading", () => {
    expect(humaniseCategory("flooring")).toBe("Flooring");
    expect(humaniseCategory("kitchen_platform")).toBe("Kitchen platform");
  });
});

describe("splitAmenitiesFullList", () => {
  it("pulls amenities_full_list out of the generic specifications list", () => {
    const flooring = {
      key: "flooring",
      label: "Flooring",
      category: "Finish quality",
      valueText: "Vitrified tiles",
      status: "available" as const,
    };
    const fullList = {
      key: "amenities_full_list",
      label: "Amenities as stated by developer",
      category: "Amenities as stated by developer",
      valueText: "Clubhouse, SKYPLEX, jogging track",
      status: "available" as const,
    };

    const result = splitAmenitiesFullList([flooring, fullList]);

    expect(result.amenitiesFullList).toEqual(fullList);
    expect(result.specifications).toEqual([flooring]);
  });

  it("returns null when the field has never been extracted", () => {
    const flooring = {
      key: "flooring",
      label: "Flooring",
      category: "Finish quality",
      valueText: "Vitrified tiles",
      status: "available" as const,
    };

    const result = splitAmenitiesFullList([flooring]);

    expect(result.amenitiesFullList).toBeNull();
    expect(result.specifications).toEqual([flooring]);
  });
});

describe("readRoomDimensions", () => {
  it("reads a well-formed room list", () => {
    const rooms = readRoomDimensions({
      rooms: [{ name: "Living", lengthFt: 16.5, widthFt: 12 }],
    });

    expect(rooms).toEqual([
      { name: "Living", lengthFt: 16.5, widthFt: 12, areaSqft: null },
    ]);
  });

  it("reads a room's own printed area alongside its sides", () => {
    const rooms = readRoomDimensions({
      rooms: [{ name: "Living", lengthFt: 16.5, widthFt: 12, areaSqft: 200 }],
    });

    expect(rooms).toEqual([
      { name: "Living", lengthFt: 16.5, widthFt: 12, areaSqft: 200 },
    ]);
  });

  it("returns null when nothing was published", () => {
    expect(readRoomDimensions(null)).toBeNull();
  });

  it.each([
    ["a shape it does not recognise", { floors: 3 }],
    ["rooms that are not a list", { rooms: "Living 16x12" }],
    ["a room with no name", { rooms: [{ lengthFt: 12, widthFt: 10 }] }],
    [
      "a room with a blank name",
      { rooms: [{ name: "  ", lengthFt: 12, widthFt: 10 }] },
    ],
    [
      "measurements as strings",
      { rooms: [{ name: "Living", lengthFt: "16", widthFt: "12" }] },
    ],
    ["a missing measurement", { rooms: [{ name: "Living", lengthFt: 16 }] }],
    [
      "a non-positive measurement",
      { rooms: [{ name: "Living", lengthFt: 0, widthFt: 12 }] },
    ],
    ["an empty room list", { rooms: [] }],
  ])("renders nothing for %s", (_label, dimensions) => {
    // `dimensions` is opaque jsonb the schema does not constrain, so an
    // unrecognised shape is a gap in what can be shown — never licence to dump
    // raw JSON at a buyer or to render a room whose measurements were unreadable.
    expect(readRoomDimensions(dimensions)).toBeNull();
  });

  it("keeps the readable rooms and drops only the unreadable ones", () => {
    const rooms = readRoomDimensions({
      rooms: [
        { name: "Living", lengthFt: 16, widthFt: 12 },
        { name: "Broken", lengthFt: null, widthFt: 12 },
      ],
    });

    expect(rooms).toEqual([
      { name: "Living", lengthFt: 16, widthFt: 12, areaSqft: null },
    ]);
  });
});

describe("formatRoomDimension", () => {
  it("uses a multiplication sign, not a letter, and the sides' own area when nothing was printed", () => {
    expect(
      formatRoomDimension({ name: "Living", lengthFt: 16.5, widthFt: 12 }),
    ).toBe("16.5 × 12 ft, 198 sq ft (calculated)");
  });

  it("prefers a room's own printed area over one calculated from its sides", () => {
    expect(
      formatRoomDimension({
        name: "Living",
        lengthFt: 16.5,
        widthFt: 12,
        areaSqft: 200,
      }),
    ).toBe("16.5 × 12 ft, 200 sq ft");
  });
});

describe("dossierBhkLabels", () => {
  it("lists each configuration once", () => {
    expect(dossierBhkLabels(richDossierFixture.unitVariants)).toEqual([
      "2 BHK",
      "3 BHK",
    ]);
  });

  it("skips a variant with no recorded configuration", () => {
    expect(
      dossierBhkLabels([
        { ...richDossierFixture.unitVariants[0]!, bhkType: null },
      ]),
    ).toEqual([]);
  });
});

describe("dossierMetadata", () => {
  it("describes the property from published facts", () => {
    const { title, description } = dossierMetadata(richDossierFixture);

    expect(title).toBe("Riverfront Heights, Vastrapur — PropCompare");
    expect(description).toContain("Sabarmati Estates");
    expect(description).toContain("2 BHK, 3 BHK");
    expect(description).toContain("30 June 2027");
  });

  it("shortens rather than pads when facts are missing", () => {
    const { description } = dossierMetadata(sparseDossierFixture);

    expect(description).toContain("Anand Niketan Residency");
    expect(description).not.toContain("Possession from");
  });

  it("carries no price into the page title or description", () => {
    for (const dossier of [richDossierFixture, sparseDossierFixture]) {
      const { title, description } = dossierMetadata(dossier);
      for (const forbidden of ["₹", "INR", "crore", "lakh", "per sq"]) {
        expect(`${title} ${description}`).not.toContain(forbidden);
      }
    }
  });
});

describe("dossierJsonLd", () => {
  it("describes a residence, never an offer", () => {
    // An offer exists to state a price. Modelling the page as one would either
    // fabricate a price or publish a conspicuously priceless offer.
    const jsonLd = dossierJsonLd(richDossierFixture);

    expect(jsonLd["@type"]).toBe("ApartmentComplex");
    expect(JSON.stringify(jsonLd)).not.toContain("Offer");
    expect(JSON.stringify(jsonLd)).not.toContain("priceRange");
  });

  it("passes the same exclusion guard the API responses do", () => {
    for (const dossier of [richDossierFixture, sparseDossierFixture]) {
      expect(findForbiddenKeys(dossierJsonLd(dossier))).toEqual([]);
    }
  });

  it("states an offered amenity as true and a refused one as false", () => {
    const jsonLd = dossierJsonLd(richDossierFixture);
    const features = jsonLd.amenityFeature as {
      name: string;
      value: boolean;
    }[];

    expect(features).toContainEqual({
      "@type": "LocationFeatureSpecification",
      name: "Clubhouse",
      value: true,
    });
    expect(features).toContainEqual({
      "@type": "LocationFeatureSpecification",
      name: "Swimming pool",
      value: false,
    });
  });

  it("omits an unrecorded amenity rather than claiming anything about it", () => {
    // `not_stated` is not a claim either way, and structured data has no
    // "unknown" a consumer would read correctly.
    const jsonLd = dossierJsonLd(richDossierFixture);
    const features = jsonLd.amenityFeature as { name: string }[];

    expect(features.map((feature) => feature.name)).not.toContain(
      "EV charging",
    );
  });

  it("guesses no URL it cannot know", () => {
    expect(dossierJsonLd(richDossierFixture)).not.toHaveProperty("url");
  });

  it("omits a postcode that was never published", () => {
    const address = dossierJsonLd(sparseDossierFixture).address as Record<
      string,
      unknown
    >;

    expect(address).not.toHaveProperty("postalCode");
    expect(address.addressLocality).toBe("Ahmedabad");
  });
});

describe("dossierFactCount", () => {
  it("counts stated facts over the facts the dossier can hold", () => {
    const rich = dossierFactCount(richDossierFixture);
    const sparse = dossierFactCount(sparseDossierFixture);

    expect(rich.total).toBeGreaterThan(0);
    expect(rich.stated).toBeLessThanOrEqual(rich.total);
    expect(rich.stated / rich.total).toBeGreaterThan(
      sparse.stated / sparse.total,
    );
  });

  it("counts a stated not-offered fact but not an unstated one", () => {
    const base = {
      ...sparseDossierFixture,
      amenities: [],
      specifications: [],
    };
    const item = (
      status: "available" | "not_stated" | "explicitly_not_offered",
    ) => ({
      key: status,
      label: status,
      category: "x",
      status,
      valueText: null,
    });
    const none = dossierFactCount({ ...base, amenities: [item("not_stated")] });
    const offered = dossierFactCount({
      ...base,
      amenities: [item("explicitly_not_offered")],
    });

    expect(offered.total).toBe(none.total);
    expect(offered.stated).toBe(none.stated + 1);
  });
});

describe("formatRoomDimension", () => {
  it("shows at most two decimals of a stored side", () => {
    expect(
      formatRoomDimension({ name: "Bedroom", lengthFt: 16.4167, widthFt: 12 }),
    ).toBe("16.42 × 12 ft, 197 sq ft (calculated)");
    expect(
      formatRoomDimension({ name: "Living", lengthFt: 16.5, widthFt: 12 }),
    ).toBe("16.5 × 12 ft, 198 sq ft (calculated)");
  });
});

describe("splitNearbyFacts", () => {
  const spec = (key: string, valueText: string | null) => ({
    key,
    label: key,
    category: "Location & legal",
    valueText,
    status:
      valueText === null ? ("not_stated" as const) : ("available" as const),
  });

  it("takes what is near the project out of the specifications, one landmark each", () => {
    const { nearby, specifications } = splitNearbyFacts([
      spec("flooring", "Vitrified tiles"),
      spec(
        "nearby_connectivity",
        "Thaltej Metro Station 1.1 Km; Airport 16.2 Km",
      ),
      spec("nearby_hospitals", "Apex Heart Institute 650 Mtr"),
      spec("nearby_schools", null),
      spec("plot_no", " 14 "),
    ]);
    expect(nearby).toEqual({
      connectivity: ["Thaltej Metro Station 1.1 Km", "Airport 16.2 Km"],
      hospitals: ["Apex Heart Institute 650 Mtr"],
      schools: [],
      plotNumber: "14",
    });
    expect(specifications.map((item) => item.key)).toEqual(["flooring"]);
  });

  it("splits on semicolons and lines, drops blanks, and rewords nothing", () => {
    expect(splitLandmarks("A 1 Km;\n B 2 Km ;; ")).toEqual([
      "A 1 Km",
      "B 2 Km",
    ]);
    expect(splitLandmarks(null)).toEqual([]);
  });
});

describe("splitListValue", () => {
  it("splits a printed run of items on semicolons and line breaks, rewording nothing", () => {
    expect(
      splitListValue(
        "Garbage chute; Rainwater harvesting ;  High speed elevators;",
      ),
    ).toEqual([
      "Garbage chute",
      "Rainwater harvesting",
      "High speed elevators",
    ]);
    expect(splitListValue("A\nB")).toEqual(["A", "B"]);
  });

  it("returns null for a value that is not a list", () => {
    expect(splitListValue("Vastu Compliant")).toBeNull();
    expect(splitListValue("Tiles, 800x800mm; ")).toBeNull();
    expect(splitListValue(null)).toBeNull();
    expect(splitListValue("")).toBeNull();
  });
});
