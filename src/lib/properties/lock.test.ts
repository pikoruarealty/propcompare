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
  it("keeps the identity, possession, RERA, specifications, location and developer", () => {
    const locked = lockDossier(richDossierFixture);

    expect(locked.name).toBe(richDossierFixture.name);
    expect(locked.possession).toEqual(richDossierFixture.possession);
    expect(locked.rera).toEqual(richDossierFixture.rera);
    expect(locked.specifications).toEqual(richDossierFixture.specifications);
    expect(locked.location).toEqual(richDossierFixture.location);
    expect(locked.developer).toEqual(richDossierFixture.developer);
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
