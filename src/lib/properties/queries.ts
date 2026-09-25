import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  ne,
  sql,
  type SQL,
} from "drizzle-orm";
import { isListed, mediaIsLive, variantIsLive } from "./visibility";
import { splitNearbyFacts } from "./dossier";
import { areaToSqft } from "@/lib/units/measurements";
import { reraSnapshotProblem, type ReraSnapshot } from "@/lib/rera/snapshot";
import { reraSourcedFacts, type CheckedRecord } from "./rera-source";
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
  propertySubmissions,
  propertyTypes,
  reraFetchJobs,
  specificationCatalog,
  unitAreas,
  unitVariantAmenities,
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
  PropertySummaryMedia,
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

/**
 * The latest successful check of the regulator's record for a property: when it
 * ran, and the handful of facts it stated. A check made while the property was
 * still a draft (its submission, before it had a property id) counts too, since
 * that is where a new listing's values are usually taken from. Only the named
 * facts are read from the stored record; nothing else leaves this function.
 */
const latestRegulatorCheck = async (
  db: PostgresJsDatabase,
  propertyId: string,
): Promise<{ checkedAt: Date | null; record: CheckedRecord | null }> => {
  const [job] = await db
    .select({
      runAt: reraFetchJobs.runAt,
      createdAt: reraFetchJobs.createdAt,
      payload: reraFetchJobs.fetchedPayload,
    })
    .from(reraFetchJobs)
    .where(
      and(
        eq(reraFetchJobs.status, "succeeded"),
        sql`(${reraFetchJobs.propertyId} = ${propertyId} or ${reraFetchJobs.submissionId} in (select ${propertySubmissions.id} from ${propertySubmissions} where ${propertySubmissions.propertyId} = ${propertyId}))`,
      ),
    )
    .orderBy(desc(reraFetchJobs.createdAt))
    .limit(1);
  if (!job) return { checkedAt: null, record: null };
  const stated = (job.payload as { record?: Record<string, unknown> } | null)
    ?.record;
  return {
    checkedAt: job.runAt ?? job.createdAt,
    record: stated
      ? {
          registrationNumber: stated.registrationNumber,
          constructionProgressPercent: stated.constructionProgressPercent,
          completionDate: stated.completionDate,
          totalUnits: stated.totalUnits,
        }
      : null,
  };
};

/** An id that is not shaped like one cannot match a row, and would make Postgres
 * refuse the comparison (a 500) instead of finding nothing (a 404). */
const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const toIsoString = (value: Date | null): string | null =>
  value === null ? null : value.toISOString();

/**
 * A property matches a BHK filter when *any* of its unit variants has that BHK
 * type — expressed as EXISTS rather than a join so a property with three
 * matching variants still counts once and pagination totals stay honest.
 */
export const bhkFilter = (key: string): SQL =>
  sql`exists (
    select 1 from ${unitVariants}
    join ${bhkTypes} on ${bhkTypes.id} = ${unitVariants.bhkTypeId}
    where ${unitVariants.propertyId} = ${properties.id}
      and ${bhkTypes.key} = ${key}
      and ${unitVariants.removedAt} is null
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
  const conditions: SQL[] = [isListed];

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
export const loadBhkTypesByProperty = async (
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
    .where(and(inArray(unitVariants.propertyId, propertyIds), variantIsLive))
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
export const loadPrimaryMediaByProperty = async (
  db: ReadDb,
  propertyIds: string[],
): Promise<Map<string, PropertySummaryMedia>> => {
  const byProperty = new Map<string, PropertySummaryMedia>();
  if (propertyIds.length === 0) return byProperty;

  const rows = await db
    .select({
      id: propertyMedia.id,
      propertyId: propertyMedia.propertyId,
      gcsPath: propertyMedia.gcsPath,
      mediaType: propertyMedia.mediaType,
      isPrimary: propertyMedia.isPrimary,
      displayOrder: propertyMedia.displayOrder,
    })
    .from(propertyMedia)
    // A card can only show a picture: brochures and videos are never its image.
    .where(
      and(
        inArray(propertyMedia.propertyId, propertyIds),
        inArray(propertyMedia.mediaType, ["photo", "floor_plan"]),
        mediaIsLive,
      ),
    )
    .orderBy(
      asc(propertyMedia.propertyId),
      desc(propertyMedia.isPrimary),
      // A photo of the building beats a floor plan as the card image.
      sql`(${propertyMedia.mediaType} = 'photo') desc`,
      asc(propertyMedia.displayOrder),
    );

  for (const row of rows) {
    // Ordering puts the winning row first, so the first seen per property wins.
    if (byProperty.has(row.propertyId)) continue;
    byProperty.set(row.propertyId, {
      id: row.id,
      gcsPath: row.gcsPath,
      mediaType: row.mediaType,
    });
  }
  return byProperty;
};

/**
 * Published `PropertySummary` rows for an arbitrary set of property ids,
 * keyed by id rather than ordered — callers with their own ordering (a saved
 * list by `savedAt`, a comparison by `displayOrder`) map over their own id
 * list and look each one up here, rather than this function guessing an
 * order. Ids with no matching published property are simply absent from the
 * map, never a thrown error — the caller decides whether that's a 404.
 */
export const loadPropertySummariesByIds = async (
  db: ReadDb,
  propertyIds: string[],
): Promise<Map<string, PropertySummary>> => {
  const map = new Map<string, PropertySummary>();
  if (propertyIds.length === 0) return map;

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
    .where(and(inArray(properties.id, propertyIds), isListed));

  const [bhkByProperty, primaryMediaByProperty] = await Promise.all([
    loadBhkTypesByProperty(db, propertyIds),
    loadPrimaryMediaByProperty(db, propertyIds),
  ]);

  for (const row of rows) {
    map.set(row.id, {
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
    });
  }
  return map;
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
 * `GET /api/v1/media/{id}` — the storage path for one `property_media` row,
 * or `null` when no row carries that id (the route turns `null` into a
 * 404). Returns the raw `gcs_path` only; resolving it into a fetchable URL
 * is the route's job, via `src/lib/storage/adapter.ts`.
 */
export const getPublishedMediaObjectPath = async (
  db: ReadDb,
  id: string,
): Promise<string | null> => {
  if (!UUID_SHAPE.test(id)) return null;
  const [row] = await db
    .select({ gcsPath: propertyMedia.gcsPath })
    .from(propertyMedia)
    .innerJoin(properties, eq(properties.id, propertyMedia.propertyId))
    .where(and(eq(propertyMedia.id, id), isListed, mediaIsLive));
  return row?.gcsPath ?? null;
};

/**
 * The published media row's object path and kind, for serving a picture or a
 * thumbnail of it; `null` when no such row exists.
 */
export const getPublishedMediaForServing = async (
  db: ReadDb,
  id: string,
): Promise<{
  gcsPath: string;
  mediaType: "photo" | "floor_plan" | "video" | "brochure_pdf";
} | null> => {
  if (!UUID_SHAPE.test(id)) return null;
  const [row] = await db
    .select({
      gcsPath: propertyMedia.gcsPath,
      mediaType: propertyMedia.mediaType,
    })
    .from(propertyMedia)
    .innerJoin(properties, eq(properties.id, propertyMedia.propertyId))
    .where(and(eq(propertyMedia.id, id), isListed, mediaIsLive));
  return row ?? null;
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
      mapUrl: properties.mapUrl,
      possessionStatus: properties.possessionStatus,
      possessionDate: properties.possessionDate,
      launchDate: properties.launchDate,
      reraRegistered: properties.reraRegistered,
      reraRegistrationNumber: properties.reraRegistrationNumber,
      reraProjectLandAreaSqft: properties.reraProjectLandAreaSqft,
      reraConstructionProgressPercent:
        properties.reraConstructionProgressPercent,
      reraSnapshot: properties.reraSnapshot,
      totalTowers: properties.totalTowers,
      totalFloors: properties.totalFloors,
      totalUnits: properties.totalUnits,
      plotAreaSqft: properties.plotAreaSqft,
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
    .where(and(eq(properties.slug, slug), isListed));

  if (!row) return null;

  const variantRows = await db
    .select({
      id: unitVariants.id,
      variantName: unitVariants.variantName,
      totalUnitsOfVariant: unitVariants.totalUnitsOfVariant,
      unitsPerFloor: unitVariants.unitsPerFloor,
      dimensions: unitVariants.dimensions,
      bhkKey: bhkTypes.key,
      bhkLabel: bhkTypes.label,
      layoutKey: layoutTypes.key,
      layoutLabel: layoutTypes.label,
    })
    .from(unitVariants)
    .leftJoin(bhkTypes, eq(bhkTypes.id, unitVariants.bhkTypeId))
    .leftJoin(layoutTypes, eq(layoutTypes.id, unitVariants.layoutTypeId))
    .where(and(eq(unitVariants.propertyId, row.id), variantIsLive))
    .orderBy(asc(unitVariants.createdAt), asc(unitVariants.variantName));

  const regulatorCheck = await latestRegulatorCheck(db, row.id);
  // A stored object that is not a snapshot of the current shape is not shown.
  const facts =
    row.reraSnapshot !== null && reraSnapshotProblem(row.reraSnapshot) === null
      ? (row.reraSnapshot as ReraSnapshot)
      : null;
  /** Square metres to two-decimal square feet, the one conversion from the
   * regulator's unit. */
  const rangeSqft = (sqm: number | undefined): string | null =>
    sqm === undefined ? null : areaToSqft(sqm, "sqm").toFixed(2);

  const [completedProjects] = await db
    .select({ value: count() })
    .from(properties)
    .where(
      and(
        eq(properties.developerId, row.developerId),
        isListed,
        eq(properties.possessionStatus, "ready_to_move"),
      ),
    );

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

  const unitAmenityRows =
    variantIds.length === 0
      ? []
      : await db
          .select({
            unitVariantId: unitVariantAmenities.unitVariantId,
            key: amenityCatalog.key,
            label: amenityCatalog.label,
            category: amenityCatalog.category,
            status: unitVariantAmenities.status,
          })
          .from(unitVariantAmenities)
          .innerJoin(
            amenityCatalog,
            eq(amenityCatalog.id, unitVariantAmenities.amenityCatalogId),
          )
          .where(
            and(
              inArray(unitVariantAmenities.unitVariantId, variantIds),
              ne(unitVariantAmenities.status, "not_stated"),
            ),
          )
          .orderBy(asc(amenityCatalog.category), asc(amenityCatalog.key));

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
      attribution: propertyMedia.attribution,
    })
    .from(propertyMedia)
    .where(and(eq(propertyMedia.propertyId, row.id), mediaIsLive))
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
    unitsPerFloor: variant.unitsPerFloor ?? null,
    dimensions: (variant.dimensions as UnitVariantDimensions | null) ?? null,
    areas: areasByVariant.get(variant.id) ?? [],
    amenities: unitAmenityRows
      .filter((amenity) => amenity.unitVariantId === variant.id)
      .map(({ key, label, category, status }) => ({
        key,
        label,
        category,
        status,
      })),
  }));

  const amenities: DossierAmenity[] = amenityRows.map((amenity) => ({
    key: amenity.key,
    label: amenity.label,
    category: amenity.category,
    status: amenity.status,
  }));

  const allSpecifications: DossierSpecification[] = specificationRows.map(
    (specification) => ({
      key: specification.key,
      label: specification.label,
      category: specification.category,
      valueText: specification.valueText ?? null,
      status: specification.status,
    }),
  );
  // What is near the project is shown with the location, not among the
  // specifications (`DECISIONS.md` 2026-09-24).
  const { nearby, specifications } = splitNearbyFacts(allSpecifications);

  const media: DossierMedia[] = mediaRows.map((mediaRow) => ({
    id: mediaRow.id,
    mediaType: mediaRow.mediaType,
    gcsPath: mediaRow.gcsPath,
    caption: mediaRow.caption ?? null,
    unitVariantId: mediaRow.unitVariantId ?? null,
    isPrimary: mediaRow.isPrimary,
    attribution: mediaRow.attribution ?? null,
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
      completedProjectsCount: completedProjects?.value ?? 0,
    },
    location: {
      city: row.city,
      locality: row.locality,
      latitude: row.latitude ?? null,
      longitude: row.longitude ?? null,
      pincode: row.pincode ?? null,
      mapUrl: row.mapUrl ?? null,
      nearby,
    },
    possession: {
      status: row.possessionStatus ?? null,
      possessionDate: row.possessionDate ?? null,
      launchDate: row.launchDate ?? null,
    },
    rera: {
      registered: row.reraRegistered,
      registrationNumber: row.reraRegistrationNumber ?? null,
      projectLandAreaSqft: row.reraProjectLandAreaSqft ?? null,
      // The regulator's own "carpet area of units (range)" from the stored
      // snapshot, converted once here (the columns that used to hold it were
      // dropped in schema v18: nothing ever wrote them).
      carpetAreaRangeMinSqft: rangeSqft(facts?.carpetAreaRangeSqm?.min),
      carpetAreaRangeMaxSqft: rangeSqft(facts?.carpetAreaRangeSqm?.max),
      constructionProgressPercent: row.reraConstructionProgressPercent ?? null,
      lastCheckedAt: toIsoString(regulatorCheck.checkedAt),
      sourcedFacts: reraSourcedFacts(regulatorCheck.record, {
        registrationNumber: row.reraRegistrationNumber ?? null,
        constructionProgressPercent:
          row.reraConstructionProgressPercent ?? null,
        possessionDate: row.possessionDate ?? null,
        totalUnits: row.totalUnits ?? null,
      }),
      facts,
    },
    totalTowers: row.totalTowers ?? null,
    totalFloors: row.totalFloors ?? null,
    totalUnits: row.totalUnits ?? null,
    plotAreaSqft: row.plotAreaSqft ?? null,
    unitVariants: unitVariantList,
    amenities,
    specifications,
    media,
  };
};
