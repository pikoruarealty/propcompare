import type { DossierMedia, PropertyDossier } from "./types";

/** How many photographs a signed-out visitor sees (the primary one first). */
export const PREVIEW_PHOTO_COUNT = 3;

/**
 * The dossier as a signed-out visitor is allowed to receive it (`AGENTS.md`,
 * "Comparison depth is gated behind sign-in", extended to the dossier by
 * `DECISIONS.md` 2026-09-24): who and where the project is, when it is ready, its
 * RERA facts, specifications, location and developer stay open. The unit
 * configurations (names and BHK stay, every measurement goes), the amenity
 * answers, every floor plan and document, and all but the first few photographs
 * are withheld.
 *
 * This runs on the server, before the dossier reaches the page or the API
 * response. Hiding sections in the browser is not a gate: the values would already
 * be in the payload. A withheld photograph's id is not sent either, so it cannot be
 * requested from the media route.
 */
export const lockDossier = (dossier: PropertyDossier): PropertyDossier => {
  const photos = dossier.media.filter((item) => item.mediaType === "photo");
  const primary = photos.filter((item) => item.isPrimary);
  const preview: DossierMedia[] = [
    ...primary,
    ...photos.filter((item) => !item.isPrimary),
  ].slice(0, PREVIEW_PHOTO_COUNT);

  return {
    ...dossier,
    unitVariants: dossier.unitVariants.map((variant) => ({
      id: variant.id,
      variantName: variant.variantName,
      bhkType: variant.bhkType,
      layoutType: null,
      totalUnitsOfVariant: null,
      unitsPerFloor: null,
      dimensions: null,
      areas: [],
    })),
    amenities: [],
    media: preview,
    lock: {
      hiddenPhotos: photos.length - preview.length,
      hiddenFloorPlans: dossier.media.filter(
        (item) => item.mediaType === "floor_plan",
      ).length,
      amenityCatalog: dossier.amenities.map(({ label, category }) => ({
        label,
        category,
      })),
    },
  };
};
