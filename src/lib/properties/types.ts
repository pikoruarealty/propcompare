/**
 * The buyer read contract as TypeScript, mirroring
 * `docs/api/api-spec.v1.md` exactly. This is the single shared source of shape
 * for the Drizzle read layer, the API routes, the buyer screens, the fixtures,
 * and the tests — a fixture that drifts from the real query is the divergence
 * class that ended the prior attempt at this product (see DECISIONS.md).
 *
 * These describe the **wire** shape, not the raw row shape. Two consequences:
 * Postgres `numeric` columns surface as strings (never `number`, so no
 * precision is lost in transit), and timestamps surface as ISO-8601 strings
 * rather than `Date`, so a fixture and a JSON response are directly
 * comparable.
 *
 * Nothing here may carry a price, price-per-square-foot, private budget
 * bucket, submission/review status, provenance, evidence, or OCR confidence.
 * `src/lib/properties/no-price.ts` enforces that against real values rather
 * than trusting this comment.
 */

export type PossessionStatus =
  "under_construction" | "ready_to_move" | "nearing_possession";

export type AreaBasis = "carpet" | "super_built_up" | "built_up";

export type CatalogItemStatus =
  "available" | "not_stated" | "explicitly_not_offered";

export type MediaType = "photo" | "floor_plan" | "video" | "brochure_pdf";

/** A controlled-vocabulary entry, always carried as key + human label. */
export interface LookupRef {
  key: string;
  label: string;
}

export interface PropertySummaryMedia {
  gcsPath: string;
  mediaType: MediaType;
}

export interface PropertySummaryDeveloper {
  id: string;
  name: string;
}

/** One row of `GET /api/v1/properties`. */
export interface PropertySummary {
  id: string;
  slug: string;
  name: string;
  propertyType: LookupRef;
  developer: PropertySummaryDeveloper;
  city: string;
  locality: string;
  possessionStatus: PossessionStatus | null;
  possessionDate: string | null;
  reraRegistered: boolean;
  /** Distinct BHK types across the property's unit variants. */
  bhkTypes: LookupRef[];
  primaryMedia: PropertySummaryMedia | null;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PropertyListResult {
  data: PropertySummary[];
  pagination: PaginationMeta;
}

export interface DossierDeveloper {
  id: string;
  name: string;
  description: string | null;
  logoGcsPath: string | null;
  website: string | null;
}

export interface DossierLocation {
  city: string;
  locality: string;
  latitude: string | null;
  longitude: string | null;
  pincode: string | null;
}

export interface DossierPossession {
  status: PossessionStatus | null;
  possessionDate: string | null;
  launchDate: string | null;
}

export interface DossierRera {
  registered: boolean;
  registrationNumber: string | null;
  /** ISO-8601. */
  lastVerifiedAt: string | null;
  projectLandAreaSqft: string | null;
  carpetAreaRangeMinSqft: string | null;
  carpetAreaRangeMaxSqft: string | null;
  constructionProgressPercent: string | null;
}

export interface UnitArea {
  basis: AreaBasis;
  areaSqft: string;
}

/**
 * Room dimensions are stored as opaque `jsonb` on `unit_variants`, so the read
 * layer passes them through unshaped rather than inventing a structure the
 * schema does not guarantee.
 */
export type UnitVariantDimensions = Record<string, unknown>;

export interface DossierUnitVariant {
  id: string;
  variantName: string;
  bhkType: LookupRef | null;
  layoutType: LookupRef | null;
  totalUnitsOfVariant: number | null;
  dimensions: UnitVariantDimensions | null;
  /** May be missing bases; an absent basis is never inferred from another. */
  areas: UnitArea[];
}

/**
 * `status` is as load-bearing as the label: `not_stated` and
 * `explicitly_not_offered` are distinct published facts, and the client must
 * render them distinctly rather than as a blank.
 */
export interface DossierAmenity {
  key: string;
  label: string;
  category: string;
  status: CatalogItemStatus;
}

export interface DossierSpecification {
  key: string;
  label: string;
  category: string;
  valueText: string | null;
  status: CatalogItemStatus;
}

export interface DossierMedia {
  id: string;
  mediaType: MediaType;
  gcsPath: string;
  caption: string | null;
  unitVariantId: string | null;
  isPrimary: boolean;
}

/** The response of `GET /api/v1/properties/{slug}`. */
export interface PropertyDossier {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  propertyType: LookupRef;
  developer: DossierDeveloper;
  location: DossierLocation;
  possession: DossierPossession;
  rera: DossierRera;
  totalTowers: number | null;
  totalUnits: number | null;
  unitVariants: DossierUnitVariant[];
  amenities: DossierAmenity[];
  specifications: DossierSpecification[];
  media: DossierMedia[];
}

export type PropertySort = "newest" | "name";

/**
 * The validated, coerced filter set for the listing route — the fixed v1 set
 * per DECISIONS.md (2026-09-02). Adding a filter here is a contract change and
 * requires an `api-spec.v1.md` update first.
 *
 * `propertyType`, `bhk`, and `amenity` carry lookup *keys*, not UUIDs.
 */
export interface ListPropertiesParams {
  page: number;
  pageSize: number;
  city?: string;
  locality?: string;
  propertyType?: string;
  bhk?: string;
  possessionStatus?: PossessionStatus;
  /** Repeated values narrow the result set (AND), they do not widen it (OR). */
  amenity?: string[];
  sort: PropertySort;
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;
export const DEFAULT_SORT: PropertySort = "newest";
