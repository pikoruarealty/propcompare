import { describe, expect, it } from "vitest";
import { findForbiddenKeys } from "./no-price";
import { richDossierFixture } from "./fixtures";
import { PREVIEW_PHOTO_COUNT, lockDossier } from "./lock";
import type { DossierMedia, PropertyDossier } from "./types";

/**
 * The dossier a signed-out visitor is handed (`DECISIONS.md` 2026-09-24). What is
 * withheld must be absent from the object itself: hiding it in the browser would
 * leave it in the page.
 */

const photo = (n: number, isPrimary = false): DossierMedia => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  mediaType: "photo",
  gcsPath: `properties/x/photo-${n}.jpg`,
  caption: `Photo ${n}`,
  unitVariantId: null,
  isPrimary,
  attribution: null,
});

const withPhotos = (count: number, primaryIndex: number): PropertyDossier => ({
  ...richDossierFixture,
  media: [
    ...Array.from({ length: count }, (_, i) =>
      photo(i + 1, i === primaryIndex),
    ),
    ...richDossierFixture.media.filter((m) => m.mediaType === "floor_plan"),
    {
      id: "99999999-9999-4999-8999-999999999999",
      mediaType: "brochure_pdf",
      gcsPath: "properties/x/brochure.pdf",
      caption: null,
      unitVariantId: null,
      isPrimary: false,
      attribution: null,
    },
  ],
});

describe("lockDossier", () => {
  it("keeps only the top of the page: identity, possession, towers and units, and the registration", () => {
    const locked = lockDossier(richDossierFixture);

    expect(locked.name).toBe(richDossierFixture.name);
    expect(locked.description).toBe(richDossierFixture.description);
    expect(locked.possession).toEqual(richDossierFixture.possession);
    expect(locked.totalTowers).toBe(richDossierFixture.totalTowers);
    expect(locked.totalUnits).toBe(richDossierFixture.totalUnits);
    expect(locked.location.locality).toBe(richDossierFixture.location.locality);
    expect(locked.location.city).toBe(richDossierFixture.location.city);
    expect(locked.developer.name).toBe(richDossierFixture.developer.name);
    expect(locked.rera.registered).toBe(richDossierFixture.rera.registered);
    expect(locked.rera.registrationNumber).toBe(
      richDossierFixture.rera.registrationNumber,
    );
    expect(locked.rera.lastCheckedAt).toBe(
      richDossierFixture.rera.lastCheckedAt,
    );
  });

  it("withholds everything below the configurations: specifications, location, RERA facts and developer detail", () => {
    const locked = lockDossier(richDossierFixture);

    expect(locked.specifications).toEqual([]);
    expect(locked.location).toMatchObject({
      pincode: null,
      latitude: null,
      longitude: null,
      mapUrl: null,
      nearby: {
        connectivity: [],
        hospitals: [],
        schools: [],
        plotNumber: null,
      },
    });
    expect(locked.rera).toMatchObject({
      projectLandAreaSqft: null,
      carpetAreaRangeMinSqft: null,
      carpetAreaRangeMaxSqft: null,
      constructionProgressPercent: null,
      facts: null,
    });
    // A credit to the regulator stays only on a fact the top still shows.
    expect(locked.rera.sourcedFacts).not.toContain("construction_progress");
    expect(locked.developer).toMatchObject({
      description: null,
      website: null,
    });
    expect(locked.totalFloors).toBeNull();
    expect(locked.plotAreaSqft).toBeNull();
    // The names of what is withheld, never this property's answers.
    expect(locked.lock?.specificationCatalog.map((s) => s.label)).toEqual(
      richDossierFixture.specifications
        .filter((s) => s.key !== "amenities_full_list")
        .map((s) => s.label),
    );
    expect(JSON.stringify(locked.lock)).not.toContain("valueText");
  });

  it("keeps each unit type's name and BHK and nothing measured", () => {
    const locked = lockDossier(richDossierFixture);

    expect(locked.unitVariants.map((v) => v.variantName)).toEqual(
      richDossierFixture.unitVariants.map((v) => v.variantName),
    );
    for (const variant of locked.unitVariants) {
      expect(variant.areas).toEqual([]);
      expect(variant.dimensions).toBeNull();
      expect(variant.layoutType).toBeNull();
      expect(variant.totalUnitsOfVariant).toBeNull();
      expect(variant.unitsPerFloor).toBeNull();
      expect(variant.amenities).toEqual([]);
    }
  });

  it("sends no amenity answers, only the catalog's names", () => {
    const locked = lockDossier(richDossierFixture);

    expect(locked.amenities).toEqual([]);
    expect(locked.lock?.amenityCatalog).toEqual(
      richDossierFixture.amenities.map(({ label, category }) => ({
        label,
        category,
      })),
    );
    expect(JSON.stringify(locked.lock)).not.toContain('"status"');
  });

  it("previews the primary photo first and withholds the rest, floor plans and documents", () => {
    const source = withPhotos(6, 4);
    const locked = lockDossier(source);

    expect(locked.media).toHaveLength(PREVIEW_PHOTO_COUNT);
    expect(locked.media.every((m) => m.mediaType === "photo")).toBe(true);
    expect(locked.media[0].id).toBe(source.media[4].id);
    expect(locked.lock?.hiddenPhotos).toBe(6 - PREVIEW_PHOTO_COUNT);
    expect(locked.lock?.hiddenFloorPlans).toBe(1);
    // A withheld picture's id is nowhere in what is sent, so it cannot be requested.
    const sent = JSON.stringify(locked);
    for (const hidden of source.media.filter(
      (m) => !locked.media.some((kept) => kept.id === m.id),
    )) {
      expect(sent).not.toContain(hidden.id);
    }
  });

  it("marks only a locked dossier: the full one has no lock", () => {
    expect(richDossierFixture.lock).toBeUndefined();
    expect(lockDossier(richDossierFixture).lock).toBeDefined();
  });

  it("still passes the buyer response leak guard", () => {
    expect(findForbiddenKeys(lockDossier(withPhotos(5, 0)))).toEqual([]);
  });
});
