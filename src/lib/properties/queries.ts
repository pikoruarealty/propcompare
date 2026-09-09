import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  amenityCatalog,
  bhkTypes,
  developers,
  layoutTypes,
  properties,
  propertyAmenities,
  propertyMedia,
  propertySpecifications,
  propertyTypes,
  specificationCatalog,
  unitAreas,
  unitVariants,
} from "@/db/schema/catalog";
import type {
  DossierAmenity,
  DossierMedia,
  DossierSpecification,
  DossierUnitVariant,
  ListPropertiesParams,
  LookupRef,
  PropertyDossier,
  PropertyListResult,
  PropertySummary,
  UnitVariantDimensions,
} from "./types";

/**
 * The read-only buyer data layer. Every function here queries published
 * catalog tables only and returns contract shapes from `./types`.
 *
 * Two deliberate constraints:
 *
 * 1. **No writes, ever.** This module imports no insert/update/delete. The one
 *    write path into the live catalog is `publishSubmission` (see AGENTS.md).
 * 2. **The database handle is a parameter, not a module import.** `@/db`
 *    throws at import time when `DATABASE_URL` is unset, which would make every
 *    fixture-path test require a running Postgres. Injecting the handle keeps
 *    this module importable — and its shapes testable — without one.
 *
 * A property is published by virtue of having a `properties` row, so no query
 * here filters on a status column. There isn't one, and no one should add one.
 */
export type ReadDb = PostgresJsDatabase<Record<string, never>>;

const toIsoString = (value: Date | null): string | null =>
  value === null ? null : value.toISOString();

/**
 * A property matches a BHK filter when *any* of its unit variants has that BHK
 * type — expressed as EXISTS rather than a join so a property with three
 * matching variants still counts once and pagination totals stay honest.
 */
const bhkFilter = (key: string): SQL =>
  sql`exists (
    select 1 from ${unitVariants}
    join ${bhkTypes} on ${bhkTypes.id} = ${unitVariants.bhkTypeId}
    where ${unitVariants.propertyId} = ${properties.id}
      and ${bhkTypes.key} = ${key}
  )`;

/**
 * One EXISTS per requested amenity, so repeating `amenity` narrows (AND)
 * rather than widens. Only `available` matches: `not_stated` and
 * `explicitly_not_offered` are recorded facts, but neither is a claim that the
 * amenity exists.
 */
const amenityFilter = (key: string): SQL =>
  sql`exists (
    select 1 from ${propertyAmenities}
    join ${amenityCatalog} on ${amenityCatalog.id} = ${propertyAmenities.amenityCatalogId}
    where ${propertyAmenities.propertyId} = ${properties.id}
      and ${amenityCatalog.key} = ${key}
      and ${propertyAmenities.status} = 'available'
  )`;

const buildListConditions = (params: ListPropertiesParams): SQL[] => {
  const conditions: SQL[] = [];

  if (params.city !== undefined) {
    conditions.push(eq(properties.city, params.city));
  }
  if (params.locality !== undefined) {
    conditions.push(eq(properties.locality, params.locality));
  }
  if (params.propertyType !== undefined) {
    conditions.push(eq(propertyTypes.key, params.propertyType));
  }
  if (params.possessionStatus !== undefined) {
    conditions.push(eq(properties.possessionStatus, params.possessionStatus));
  }
  if (params.bhk !== undefined) {
    conditions.push(bhkFilter(params.bhk));
  }
  for (const key of params.amenity ?? []) {
    conditions.push(amenityFilter(key));
  }

  return conditions;
};

/**
 * Distinct BHK types per property for the page's rows, fetched in one query
 * keyed by property id rather than per row, so a 20-row page costs one extra
 * round trip instead of twenty.
 */
const loadBhkTypesByProperty = async (
  db: ReadDb,
  propertyIds: string[],
): Promise<Map<string, LookupRef[]>> => {
  const byProperty = new Map<string, LookupRef[]>();
  if (propertyIds.length === 0) return byProperty;

  const rows = await db
    .selectDistinct({
      propertyId: unitVariants.propertyId,
      key: bhkTypes.key,
      label: bhkTypes.label,
    })
    .from(unitVariants)
    .innerJoin(bhkTypes, eq(bhkTypes.id, unitVariants.bhkTypeId))
    .where(inArray(unitVariants.propertyId, propertyIds))
    .orderBy(asc(bhkTypes.key));

  for (const row of rows) {
    const existing = byProperty.get(row.propertyId);
    const ref: LookupRef = { key: row.key, label: row.label };
    if (existing) {
      existing.push(ref);
    } else {
      byProperty.set(row.propertyId, [ref]);
    }
  }
  return byProperty;
};

/**
 * The card image for each property on the page: the row flagged `isPrimary`,
 * falling back to the lowest `displayOrder`. A property with no media has no
 * card image rather than a placeholder.
 */
const loadPrimaryMediaByProperty = async (
  db: ReadDb,
  propertyIds: string[],
): Promise<
  Map<string, { gcsPath: string; mediaType: DossierMedia["mediaType"] }>
> => {
  const byProperty = new Map<
    string,
    { gcsPath: string; mediaType: DossierMedia["mediaType"] }
  >();
  if (propertyIds.length === 0) return byProperty;

  const rows = await db
    .select({
      propertyId: propertyMedia.propertyId,
      gcsPath: propertyMedia.gcsPath,
      mediaType: propertyMedia.mediaType,
      isPrimary: propertyMedia.isPrimary,
      displayOrder: propertyMedia.displayOrder,
    })
    .from(propertyMedia)
    .where(inArray(propertyMedia.propertyId, propertyIds))
    .orderBy(
      asc(propertyMedia.propertyId),
      desc(propertyMedia.isPrimary),
      asc(propertyMedia.displayOrder),
    );

  for (const row of rows) {
    // Ordering puts the winning row first, so the first seen per property wins.
    if (byProperty.has(row.propertyId)) continue;
    byProperty.set(row.propertyId, {
      gcsPath: row.gcsPath,
      mediaType: row.mediaType,
    });
  }
  return byProperty;
};

/** `GET /api/v1/properties` — paginated published-property summaries. */
export const listPublishedProperties = async (
  db: ReadDb,
  params: ListPropertiesParams,
): Promise<PropertyListResult> => {
  const conditions = buildListConditions(params);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(properties)
    .innerJoin(propertyTypes, eq(propertyTypes.id, properties.propertyTypeId))
    .where(where);
  const total = countRow?.total ?? 0;

  const rows = await db
    .select({
      id: properties.id,
      slug: properties.slug,
      name: properties.name,
      city: properties.city,
      locality: properties.locality,
      possessionStatus: properties.possessionStatus,
      possessionDate: properties.possessionDate,
      reraRegistered: properties.reraRegistered,
      propertyTypeKey: propertyTypes.key,
      propertyTypeLabel: propertyTypes.label,
      developerId: developers.id,
      developerName: developers.name,
    })
    .from(properties)
    .innerJoin(propertyTypes, eq(propertyTypes.id, properties.propertyTypeId))
    .innerJoin(developers, eq(developers.id, properties.developerId))
    .where(where)
    .orderBy(
      params.sort === "name"
        ? asc(properties.name)
        : desc(properties.createdAt),
    )
    .limit(params.pageSize)
    .offset((params.page - 1) * params.pageSize);

  const propertyIds = rows.map((row) => row.id);
  const [bhkByProperty, primaryMediaByProperty] = await Promise.all([
    loadBhkTypesByProperty(db, propertyIds),
    loadPrimaryMediaByProperty(db, propertyIds),
  ]);

  const data: PropertySummary[] = rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    propertyType: { key: row.propertyTypeKey, label: row.propertyTypeLabel },
    developer: { id: row.developerId, name: row.developerName },
    city: row.city,
    locality: row.locality,
    possessionStatus: row.possessionStatus ?? null,
    possessionDate: row.possessionDate ?? null,
    reraRegistered: row.reraRegistered,
    bhkTypes: bhkByProperty.get(row.id) ?? [],
    primaryMedia: primaryMediaByProperty.get(row.id) ?? null,
  }));

  return {
    data,
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      total,
      totalPages: Math.ceil(total / params.pageSize),
    },
  };
};

/**
 * `GET /api/v1/properties/{slug}` — the full published dossier, or `null` when
 * no property carries that slug (the route turns `null` into a 404).
 */
export const getPublishedPropertyBySlug = async (
  db: ReadDb,
  slug: string,
): Promise<PropertyDossier | null> => {
  const [row] = await db
    .select({
      id: properties.id,
      slug: properties.slug,
      name: properties.name,
      description: properties.description,
      city: properties.city,
      locality: properties.locality,
      latitude: properties.latitude,
      longitude: properties.longitude,
      pincode: properties.pincode,
      possessionStatus: properties.possessionStatus,
      possessionDate: properties.possessionDate,
      launchDate: properties.launchDate,
      reraRegistered: properties.reraRegistered,
      reraRegistrationNumber: properties.reraRegistrationNumber,
      reraLastVerifiedAt: properties.reraLastVerifiedAt,
      reraProjectLandAreaSqft: properties.reraProjectLandAreaSqft,
      reraCarpetAreaRangeMinSqft: properties.reraCarpetAreaRangeMinSqft,
      reraCarpetAreaRangeMaxSqft: properties.reraCarpetAreaRangeMaxSqft,
      reraConstructionProgressPercent:
        properties.reraConstructionProgressPercent,
      totalTowers: properties.totalTowers,
      totalUnits: properties.totalUnits,
      propertyTypeKey: propertyTypes.key,
      propertyTypeLabel: propertyTypes.label,
      developerId: developers.id,
      developerName: developers.name,
      developerDescription: developers.description,
      developerLogoGcsPath: developers.logoGcsPath,
      developerWebsite: developers.website,
    })
    .from(properties)
    .innerJoin(propertyTypes, eq(propertyTypes.id, properties.propertyTypeId))
    .innerJoin(developers, eq(developers.id, properties.developerId))
    .where(eq(properties.slug, slug));

  if (!row) return null;

  const variantRows = await db
    .select({
      id: unitVariants.id,
      variantName: unitVariants.variantName,
      totalUnitsOfVariant: unitVariants.totalUnitsOfVariant,
      dimensions: unitVariants.dimensions,
      bhkKey: bhkTypes.key,
      bhkLabel: bhkTypes.label,
      layoutKey: layoutTypes.key,
      layoutLabel: layoutTypes.label,
    })
    .from(unitVariants)
    .leftJoin(bhkTypes, eq(bhkTypes.id, unitVariants.bhkTypeId))
    .leftJoin(layoutTypes, eq(layoutTypes.id, unitVariants.layoutTypeId))
    .where(eq(unitVariants.propertyId, row.id))
    .orderBy(asc(unitVariants.createdAt), asc(unitVariants.variantName));

  const variantIds = variantRows.map((variant) => variant.id);
  const areaRows =
    variantIds.length === 0
      ? []
      : await db
          .select({
            unitVariantId: unitAreas.unitVariantId,
            basis: unitAreas.basis,
            areaSqft: unitAreas.areaSqft,
          })
          .from(unitAreas)
          .where(inArray(unitAreas.unitVariantId, variantIds))
          .orderBy(asc(unitAreas.basis));

  const areasByVariant = new Map<string, DossierUnitVariant["areas"]>();
  for (const area of areaRows) {
    const entry = { basis: area.basis, areaSqft: area.areaSqft };
    const existing = areasByVariant.get(area.unitVariantId);
    if (existing) {
      existing.push(entry);
    } else {
      areasByVariant.set(area.unitVariantId, [entry]);
    }
  }

  // Every associated row is returned regardless of status: `not_stated` and
  // `explicitly_not_offered` are facts the client must render, and filtering
  // them out would make genuine absence indistinguishable from an unanswered
  // question.
  const amenityRows = await db
    .select({
      key: amenityCatalog.key,
      label: amenityCatalog.label,
      category: amenityCatalog.category,
      status: propertyAmenities.status,
    })
    .from(propertyAmenities)
    .innerJoin(
      amenityCatalog,
      eq(amenityCatalog.id, propertyAmenities.amenityCatalogId),
    )
    .where(eq(propertyAmenities.propertyId, row.id))
    .orderBy(asc(amenityCatalog.category), asc(amenityCatalog.key));

  const specificationRows = await db
    .select({
      key: specificationCatalog.key,
      label: specificationCatalog.label,
      category: specificationCatalog.category,
      valueText: propertySpecifications.valueText,
      status: propertySpecifications.status,
    })
    .from(propertySpecifications)
    .innerJoin(
      specificationCatalog,
      eq(
        specificationCatalog.id,
        propertySpecifications.specificationCatalogId,
      ),
    )
    .where(eq(propertySpecifications.propertyId, row.id))
    .orderBy(asc(specificationCatalog.category), asc(specificationCatalog.key));

  const mediaRows = await db
    .select({
      id: propertyMedia.id,
      mediaType: propertyMedia.mediaType,
      gcsPath: propertyMedia.gcsPath,
      caption: propertyMedia.caption,
      unitVariantId: propertyMedia.unitVariantId,
      isPrimary: propertyMedia.isPrimary,
    })
    .from(propertyMedia)
    .where(eq(propertyMedia.propertyId, row.id))
    .orderBy(asc(propertyMedia.displayOrder));

  const unitVariantList: DossierUnitVariant[] = variantRows.map((variant) => ({
    id: variant.id,
    variantName: variant.variantName,
    bhkType:
      variant.bhkKey !== null && variant.bhkLabel !== null
        ? { key: variant.bhkKey, label: variant.bhkLabel }
        : null,
    layoutType:
      variant.layoutKey !== null && variant.layoutLabel !== null
        ? { key: variant.layoutKey, label: variant.layoutLabel }
        : null,
    totalUnitsOfVariant: variant.totalUnitsOfVariant ?? null,
    dimensions: (variant.dimensions as UnitVariantDimensions | null) ?? null,
    areas: areasByVariant.get(variant.id) ?? [],
  }));

  const amenities: DossierAmenity[] = amenityRows.map((amenity) => ({
    key: amenity.key,
    label: amenity.label,
    category: amenity.category,
    status: amenity.status,
  }));

  const specifications: DossierSpecification[] = specificationRows.map(
    (specification) => ({
      key: specification.key,
      label: specification.label,
      category: specification.category,
      valueText: specification.valueText ?? null,
      status: specification.status,
    }),
  );

  const media: DossierMedia[] = mediaRows.map((mediaRow) => ({
    id: mediaRow.id,
    mediaType: mediaRow.mediaType,
    gcsPath: mediaRow.gcsPath,
    caption: mediaRow.caption ?? null,
    unitVariantId: mediaRow.unitVariantId ?? null,
    isPrimary: mediaRow.isPrimary,
  }));

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? null,
    propertyType: { key: row.propertyTypeKey, label: row.propertyTypeLabel },
    developer: {
      id: row.developerId,
      name: row.developerName,
      description: row.developerDescription ?? null,
      logoGcsPath: row.developerLogoGcsPath ?? null,
      website: row.developerWebsite ?? null,
    },
    location: {
      city: row.city,
      locality: row.locality,
      latitude: row.latitude ?? null,
      longitude: row.longitude ?? null,
      pincode: row.pincode ?? null,
    },
    possession: {
      status: row.possessionStatus ?? null,
      possessionDate: row.possessionDate ?? null,
      launchDate: row.launchDate ?? null,
    },
    rera: {
      registered: row.reraRegistered,
      registrationNumber: row.reraRegistrationNumber ?? null,
      lastVerifiedAt: toIsoString(row.reraLastVerifiedAt),
      projectLandAreaSqft: row.reraProjectLandAreaSqft ?? null,
      carpetAreaRangeMinSqft: row.reraCarpetAreaRangeMinSqft ?? null,
      carpetAreaRangeMaxSqft: row.reraCarpetAreaRangeMaxSqft ?? null,
      constructionProgressPercent: row.reraConstructionProgressPercent ?? null,
    },
    totalTowers: row.totalTowers ?? null,
    totalUnits: row.totalUnits ?? null,
    unitVariants: unitVariantList,
    amenities,
    specifications,
    media,
  };
};
