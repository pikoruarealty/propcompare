import { describe, expect, it } from "vitest";
import {
  assertNoExcludedData,
  BuyerResponseLeakError,
  findForbiddenKeys,
} from "./no-price";
import {
  dossierFixturesBySlug,
  emptyPropertyListFixture,
  propertyListFixture,
  richDossierFixture,
  sparseDossierFixture,
  sparseSummaryFixture,
} from "./fixtures";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  type PropertyDossier,
  type PropertySummary,
} from "./types";

/**
 * Fixture-path tests: these run without a database. The Drizzle queries
 * themselves are covered in `queries.integration.test.ts`, which needs a real
 * Postgres — the split mirrors the existing publisher tests.
 */

describe("exclusion-list guard", () => {
  // A guard that cannot fail proves nothing, so it is tested against known
  // leaks before it is trusted against the fixtures.
  it("catches an excluded key at the top level", () => {
    const matches = findForbiddenKeys({ name: "X", priceInr: "4500000" });
    expect(matches).toHaveLength(1);
    expect(matches[0]?.path).toBe("priceInr");
  });

  it("catches an excluded key nested inside arrays and objects", () => {
    const leaked = {
      data: [
        { slug: "a", unitVariants: [{ id: "1" }] },
        { slug: "b", unitVariants: [{ id: "2", pricePerSqft: "5200" }] },
      ],
    };
    expect(findForbiddenKeys(leaked).map((match) => match.path)).toEqual([
      "data.1.unitVariants.0.pricePerSqft",
    ]);
  });

  it.each([
    ["budgetBucketId", { budgetBucketId: "b1" }],
    ["confidence", { confidence: 0.82 }],
    ["submissionId", { submissionId: "s1" }],
    ["reviewStatus", { reviewStatus: "confirmed" }],
    ["totalAmountInr", { totalAmountInr: "1" }],
  ])("rejects %s", (_label, value) => {
    expect(findForbiddenKeys(value).length).toBeGreaterThan(0);
  });

  it("does not flag legitimate contract keys", () => {
    expect(findForbiddenKeys(richDossierFixture)).toEqual([]);
  });

  it("survives a cyclic graph rather than hanging", () => {
    const cyclic: Record<string, unknown> = { slug: "a" };
    cyclic.self = cyclic;
    expect(findForbiddenKeys(cyclic)).toEqual([]);
  });

  it("throws with the offending path named", () => {
    expect(() => assertNoExcludedData({ nested: { priceInr: 1 } })).toThrow(
      BuyerResponseLeakError,
    );
    expect(() => assertNoExcludedData({ nested: { priceInr: 1 } })).toThrow(
      /nested\.priceInr/,
    );
  });

  it("returns the value unchanged when clean", () => {
    expect(assertNoExcludedData(richDossierFixture)).toBe(richDossierFixture);
  });
});

describe("fixtures carry no excluded data", () => {
  it.each([
    ["property list", propertyListFixture],
    ["empty list", emptyPropertyListFixture],
    ["rich dossier", richDossierFixture],
    ["sparse dossier", sparseDossierFixture],
  ])("%s", (_label, fixture) => {
    expect(findForbiddenKeys(fixture)).toEqual([]);
  });
});

describe("summary fixtures match the listing contract", () => {
  const summaryKeys: (keyof PropertySummary)[] = [
    "id",
    "slug",
    "name",
    "propertyType",
    "developer",
    "city",
    "locality",
    "possessionStatus",
    "possessionDate",
    "reraRegistered",
    "bhkTypes",
    "primaryMedia",
  ];

  it("every summary carries exactly the contract keys", () => {
    for (const summary of propertyListFixture.data) {
      expect(Object.keys(summary).sort()).toEqual([...summaryKeys].sort());
    }
  });

  it("pagination is internally consistent", () => {
    const { data, pagination } = propertyListFixture;
    expect(data.length).toBeLessThanOrEqual(pagination.pageSize);
    expect(pagination.totalPages).toBe(
      Math.ceil(pagination.total / pagination.pageSize),
    );
    expect(pagination.pageSize).toBeLessThanOrEqual(MAX_PAGE_SIZE);
  });

  it("the empty page reports zero pages rather than one blank page", () => {
    expect(emptyPropertyListFixture.data).toEqual([]);
    expect(emptyPropertyListFixture.pagination.total).toBe(0);
    expect(emptyPropertyListFixture.pagination.totalPages).toBe(0);
  });

  it("defaults line up with the documented contract", () => {
    expect(DEFAULT_PAGE_SIZE).toBe(20);
    expect(MAX_PAGE_SIZE).toBe(50);
    expect(propertyListFixture.pagination.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it("a property with no media has no card image rather than a placeholder", () => {
    expect(sparseSummaryFixture.primaryMedia).toBeNull();
  });

  it("lookup refs always carry both key and label", () => {
    for (const summary of propertyListFixture.data) {
      expect(summary.propertyType.key).toBeTruthy();
      expect(summary.propertyType.label).toBeTruthy();
      for (const bhk of summary.bhkTypes) {
        expect(bhk.key).toBeTruthy();
        expect(bhk.label).toBeTruthy();
      }
    }
  });
});

describe("dossier fixtures match the dossier contract", () => {
  const dossierKeys: (keyof PropertyDossier)[] = [
    "id",
    "slug",
    "name",
    "description",
    "propertyType",
    "developer",
    "location",
    "possession",
    "rera",
    "totalTowers",
    "totalUnits",
    "unitVariants",
    "amenities",
    "specifications",
    "media",
  ];

  it.each(Object.entries(dossierFixturesBySlug))(
    "%s carries exactly the contract keys",
    (_slug, dossier) => {
      expect(Object.keys(dossier).sort()).toEqual([...dossierKeys].sort());
    },
  );

  it.each(Object.entries(dossierFixturesBySlug))(
    "%s never omits a key in place of a null",
    (_slug, dossier) => {
      // Absence must be an explicit null: an omitted key and a published null
      // are different claims, and the UI must not conflate them.
      for (const key of dossierKeys) {
        expect(dossier).toHaveProperty(key);
      }
      expect(dossier.rera).toHaveProperty("registrationNumber");
      expect(dossier.location).toHaveProperty("latitude");
      expect(dossier.possession).toHaveProperty("possessionDate");
    },
  );

  it("the sparse dossier really is sparse", () => {
    // If this starts passing trivially, the sparse fixture has drifted into a
    // rich one and has stopped testing the incompleteness paths.
    expect(sparseDossierFixture.description).toBeNull();
    expect(sparseDossierFixture.media).toEqual([]);
    expect(sparseDossierFixture.rera.registered).toBe(false);
    expect(sparseDossierFixture.rera.registrationNumber).toBeNull();
    expect(sparseDossierFixture.rera.lastVerifiedAt).toBeNull();
    expect(sparseDossierFixture.location.latitude).toBeNull();
    expect(sparseDossierFixture.possession.status).toBeNull();
    expect(sparseDossierFixture.totalUnits).toBeNull();
  });

  it("exercises both honest-incompleteness states", () => {
    const statuses = sparseDossierFixture.amenities.map(
      (amenity) => amenity.status,
    );
    expect(statuses).toContain("not_stated");
    expect(statuses).toContain("explicitly_not_offered");
  });

  it("keeps unstated amenities in the payload rather than filtering them out", () => {
    // The client cannot distinguish "not offered" from "never asked" if the
    // read layer silently drops non-available rows.
    const unavailable = richDossierFixture.amenities.filter(
      (amenity) => amenity.status !== "available",
    );
    expect(unavailable.length).toBeGreaterThan(0);
  });

  it("never derives a missing area basis from a present one", () => {
    const partial = richDossierFixture.unitVariants.find(
      (variant) => variant.areas.length === 1,
    );
    expect(partial).toBeDefined();
    expect(partial?.areas[0]?.basis).toBe("carpet");
    expect(partial?.areas.map((area) => area.basis)).not.toContain(
      "super_built_up",
    );
  });

  it("allows a variant with no layout type and no dimensions", () => {
    const bare = sparseDossierFixture.unitVariants[0];
    expect(bare?.layoutType).toBeNull();
    expect(bare?.dimensions).toBeNull();
    expect(bare?.totalUnitsOfVariant).toBeNull();
  });

  it("areas are strings so numeric precision survives the wire", () => {
    for (const dossier of Object.values(dossierFixturesBySlug)) {
      for (const variant of dossier.unitVariants) {
        for (const area of variant.areas) {
          expect(typeof area.areaSqft).toBe("string");
        }
      }
    }
  });

  it("timestamps are ISO-8601 strings, not Date objects", () => {
    expect(richDossierFixture.rera.lastVerifiedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
  });

  it("summary and dossier agree on identity for the same property", () => {
    for (const summary of propertyListFixture.data) {
      const dossier = dossierFixturesBySlug[summary.slug];
      expect(dossier).toBeDefined();
      expect(dossier?.id).toBe(summary.id);
      expect(dossier?.name).toBe(summary.name);
      expect(dossier?.propertyType).toEqual(summary.propertyType);
      expect(dossier?.location.city).toBe(summary.city);
      expect(dossier?.location.locality).toBe(summary.locality);
      expect(dossier?.possession.status).toBe(summary.possessionStatus);
      expect(dossier?.rera.registered).toBe(summary.reraRegistered);
    }
  });

  it("summary bhkTypes are exactly the distinct variant BHK types", () => {
    for (const summary of propertyListFixture.data) {
      const dossier = dossierFixturesBySlug[summary.slug];
      const distinct = [
        ...new Set(
          (dossier?.unitVariants ?? [])
            .map((variant) => variant.bhkType?.key)
            .filter((key): key is string => key !== undefined),
        ),
      ].sort();
      expect(summary.bhkTypes.map((bhk) => bhk.key).sort()).toEqual(distinct);
    }
  });

  it("summary primaryMedia matches the dossier's primary media row", () => {
    for (const summary of propertyListFixture.data) {
      const dossier = dossierFixturesBySlug[summary.slug];
      const primary =
        dossier?.media.find((item) => item.isPrimary) ?? dossier?.media[0];
      if (primary === undefined) {
        expect(summary.primaryMedia).toBeNull();
      } else {
        expect(summary.primaryMedia).toEqual({
          gcsPath: primary.gcsPath,
          mediaType: primary.mediaType,
        });
      }
    }
  });
});
