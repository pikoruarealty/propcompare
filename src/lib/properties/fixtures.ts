import type {
  PropertyDossier,
  PropertyListResult,
  PropertySummary,
} from "./types";

/**
 * Typed test doubles for the buyer read contract.
 *
 * These are **not** a parallel data path (see DECISIONS.md, 2026-09-02). They
 * satisfy the same exported types as the real Drizzle queries, so a shape that
 * drifts in one place fails to compile in the other. They exist so component
 * and route tests can run without a database — not so the UI can be built
 * against an invented shape.
 *
 * `sparseDossierFixture` is the important one. A property whose every field is
 * populated is the easy case and the rare one; the honest-incompleteness rules
 * only get exercised by a property that is missing things.
 */

export const richSummaryFixture: PropertySummary = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "riverfront-heights",
  name: "Riverfront Heights",
  propertyType: { key: "apartment", label: "Apartment" },
  developer: {
    id: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
    name: "Sabarmati Estates",
  },
  city: "Ahmedabad",
  locality: "Vastrapur",
  possessionStatus: "under_construction",
  possessionDate: "2027-06-30",
  reraRegistered: true,
  bhkTypes: [
    { key: "2bhk", label: "2 BHK" },
    { key: "3bhk", label: "3 BHK" },
  ],
  primaryMedia: {
    gcsPath: "properties/riverfront-heights/exterior-01.jpg",
    mediaType: "photo",
  },
};

/**
 * No possession date, no RERA registration, no media, one BHK type. Every
 * absence here is a real state the catalog can hold, not a gap in the fixture.
 */
export const sparseSummaryFixture: PropertySummary = {
  id: "22222222-2222-4222-8222-222222222222",
  slug: "anand-niketan-residency",
  name: "Anand Niketan Residency",
  propertyType: { key: "apartment", label: "Apartment" },
  developer: {
    id: "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb",
    name: "Niketan Builders",
  },
  city: "Ahmedabad",
  locality: "Bodakdev",
  possessionStatus: null,
  possessionDate: null,
  reraRegistered: false,
  bhkTypes: [{ key: "2bhk", label: "2 BHK" }],
  primaryMedia: null,
};

export const propertyListFixture: PropertyListResult = {
  data: [richSummaryFixture, sparseSummaryFixture],
  pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
};

/** An empty page — the no-match state, which the browse UI must render. */
export const emptyPropertyListFixture: PropertyListResult = {
  data: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};

export const richDossierFixture: PropertyDossier = {
  id: richSummaryFixture.id,
  slug: richSummaryFixture.slug,
  name: richSummaryFixture.name,
  description:
    "A riverfront development of two towers with a shared podium garden.",
  propertyType: richSummaryFixture.propertyType,
  developer: {
    id: richSummaryFixture.developer.id,
    name: richSummaryFixture.developer.name,
    description: "Ahmedabad-based developer active since 1998.",
    logoGcsPath: "developers/sabarmati-estates/logo.png",
    website: "https://example.invalid/sabarmati-estates",
  },
  location: {
    city: "Ahmedabad",
    locality: "Vastrapur",
    latitude: "23.036900",
    longitude: "72.529700",
    pincode: "380015",
  },
  possession: {
    status: "under_construction",
    possessionDate: "2027-06-30",
    launchDate: "2024-01-15",
  },
  rera: {
    registered: true,
    registrationNumber: "PR/GJ/AHMEDABAD/AHMEDABAD CITY/AUDA/RAA12345/010124",
    lastVerifiedAt: "2026-08-20T09:15:00.000Z",
    projectLandAreaSqft: "48000.00",
    carpetAreaRangeMinSqft: "985.00",
    carpetAreaRangeMaxSqft: "1640.00",
    constructionProgressPercent: "42.50",
  },
  totalTowers: 2,
  totalUnits: 184,
  unitVariants: [
    {
      id: "cccccccc-1111-4111-8111-cccccccccccc",
      variantName: "Tower A — 2 BHK",
      bhkType: { key: "2bhk", label: "2 BHK" },
      layoutType: { key: "corner", label: "Corner" },
      totalUnitsOfVariant: 96,
      dimensions: {
        rooms: [
          { name: "Living", lengthFt: 16.5, widthFt: 12 },
          { name: "Master bedroom", lengthFt: 12, widthFt: 11 },
        ],
      },
      areas: [
        { basis: "carpet", areaSqft: "985.00" },
        { basis: "built_up", areaSqft: "1180.00" },
        { basis: "super_built_up", areaSqft: "1425.00" },
      ],
    },
    {
      id: "dddddddd-1111-4111-8111-dddddddddddd",
      variantName: "Tower B — 3 BHK",
      bhkType: { key: "3bhk", label: "3 BHK" },
      layoutType: null,
      totalUnitsOfVariant: 88,
      dimensions: null,
      // Only carpet area was published. The other bases must render as
      // unstated, never derived from this one.
      areas: [{ basis: "carpet", areaSqft: "1310.00" }],
    },
  ],
  amenities: [
    {
      key: "clubhouse",
      label: "Clubhouse",
      category: "lifestyle",
      status: "available",
    },
    {
      key: "swimming_pool",
      label: "Swimming pool",
      category: "lifestyle",
      status: "explicitly_not_offered",
    },
    {
      key: "ev_charging",
      label: "EV charging",
      category: "utility",
      status: "not_stated",
    },
  ],
  specifications: [
    {
      key: "flooring_living",
      label: "Living room flooring",
      category: "flooring",
      valueText: "Vitrified tiles, 800x800mm",
      status: "available",
    },
    {
      key: "kitchen_platform",
      label: "Kitchen platform",
      category: "kitchen",
      valueText: null,
      status: "not_stated",
    },
  ],
  media: [
    {
      id: "eeeeeeee-1111-4111-8111-eeeeeeeeeeee",
      mediaType: "photo",
      gcsPath: "properties/riverfront-heights/exterior-01.jpg",
      caption: "East elevation",
      unitVariantId: null,
      isPrimary: true,
    },
    {
      id: "ffffffff-1111-4111-8111-ffffffffffff",
      mediaType: "floor_plan",
      gcsPath: "properties/riverfront-heights/floor-plan-2bhk.pdf",
      caption: null,
      unitVariantId: "cccccccc-1111-4111-8111-cccccccccccc",
      isPrimary: false,
    },
  ],
};

/**
 * The hard case: no description, no RERA facts at all, no media, no
 * coordinates, a variant with no BHK type and a single area basis, and both
 * honest-incompleteness states present. Any screen that renders this without
 * a blank gap or a fabricated value is rendering absence correctly.
 */
export const sparseDossierFixture: PropertyDossier = {
  id: sparseSummaryFixture.id,
  slug: sparseSummaryFixture.slug,
  name: sparseSummaryFixture.name,
  description: null,
  propertyType: sparseSummaryFixture.propertyType,
  developer: {
    id: sparseSummaryFixture.developer.id,
    name: sparseSummaryFixture.developer.name,
    description: null,
    logoGcsPath: null,
    website: null,
  },
  location: {
    city: "Ahmedabad",
    locality: "Bodakdev",
    latitude: null,
    longitude: null,
    pincode: null,
  },
  possession: {
    status: null,
    possessionDate: null,
    launchDate: null,
  },
  rera: {
    registered: false,
    registrationNumber: null,
    lastVerifiedAt: null,
    projectLandAreaSqft: null,
    carpetAreaRangeMinSqft: null,
    carpetAreaRangeMaxSqft: null,
    constructionProgressPercent: null,
  },
  totalTowers: null,
  totalUnits: null,
  unitVariants: [
    {
      id: "cccccccc-2222-4222-8222-cccccccccccc",
      variantName: "Type 1",
      bhkType: { key: "2bhk", label: "2 BHK" },
      layoutType: null,
      totalUnitsOfVariant: null,
      dimensions: null,
      areas: [{ basis: "carpet", areaSqft: "870.00" }],
    },
  ],
  amenities: [
    {
      key: "clubhouse",
      label: "Clubhouse",
      category: "lifestyle",
      status: "not_stated",
    },
    {
      key: "swimming_pool",
      label: "Swimming pool",
      category: "lifestyle",
      status: "explicitly_not_offered",
    },
  ],
  specifications: [
    {
      key: "flooring_living",
      label: "Living room flooring",
      category: "flooring",
      valueText: null,
      status: "not_stated",
    },
  ],
  media: [],
};

export const dossierFixturesBySlug: Record<string, PropertyDossier> = {
  [richDossierFixture.slug]: richDossierFixture,
  [sparseDossierFixture.slug]: sparseDossierFixture,
};
