import type { ReraSourcedFact } from "./rera-source";
import type { DossierMedia, PropertyDossier } from "./types";

/** How many photographs a signed-out visitor sees (the primary one first). */
export const PREVIEW_PHOTO_COUNT = 3;

/** The regulator-checked facts the open top of the page shows. */
const TOP_SOURCED_FACTS = new Set<ReraSourcedFact>([
  "registration_number",
  "possession_date",
  "total_units",
]);

/**
 * The dossier as a signed-out visitor is allowed to receive it (`AGENTS.md`,
 * "Comparison depth is gated behind sign-in", extended to the dossier by
 * `DECISIONS.md` 2026-09-24, narrowed 2026-09-25): only the top of the page stays
 * open: who and where the project is (name, type, developer's name, locality and
 * city), its description, when it is ready, its towers and units, whether it is
 * RERA registered and under which number, the unit types' names and BHK, and the
 * first few photographs. Everything below the configurations is withheld: every
 * unit-type measurement, the amenity answers, the specifications, the location
 * detail (pincode, map, position, what is nearby), the RERA facts beyond the
 * registration, the developer's description and website, every floor plan and
 * document, and the other photographs.
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
      amenities: [],
    })),
    amenities: [],
    specifications: [],
    plotAreaSqft: null,
    totalFloors: null,
    // The top keeps the locality and city it prints; the rest of the location is
    // detail.
    location: {
      city: dossier.location.city,
      locality: dossier.location.locality,
      latitude: null,
      longitude: null,
      pincode: null,
      mapUrl: null,
      nearby: {
        connectivity: [],
        hospitals: [],
        schools: [],
        plotNumber: null,
      },
    },
    // Registered, the number and when it was checked stay (the badge at the top);
    // a "Source: GujRERA" credit stays only on the facts the top shows.
    rera: {
      registered: dossier.rera.registered,
      registrationNumber: dossier.rera.registrationNumber,
      lastCheckedAt: dossier.rera.lastCheckedAt,
      sourcedFacts: dossier.rera.sourcedFacts.filter((fact) =>
        TOP_SOURCED_FACTS.has(fact),
      ),
      projectLandAreaSqft: null,
      carpetAreaRangeMinSqft: null,
      carpetAreaRangeMaxSqft: null,
      constructionProgressPercent: null,
      facts: null,
    },
    developer: {
      id: dossier.developer.id,
      name: dossier.developer.name,
      description: null,
      logoGcsPath: null,
      website: null,
      completedProjectsCount: 0,
    },
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
      // The specification vocabulary, never this property's answers; the
      // developer's own list of amenities is not a catalog row, so it is left out.
      specificationCatalog: dossier.specifications
        .filter((spec) => spec.key !== "amenities_full_list")
        .map(({ label, category }) => ({ label, category })),
    },
  };
};
