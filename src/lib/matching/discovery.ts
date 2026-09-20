import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { isListed } from "@/lib/properties/visibility";
import { developers, properties, propertyTypes } from "@/db/schema/catalog";
import {
  bhkFilter,
  loadBhkTypesByProperty,
  loadPrimaryMediaByProperty,
  type ReadDb,
} from "@/lib/properties/queries";
import type {
  PropertyListResult,
  PropertySummary,
} from "@/lib/properties/types";
import {
  matchPropertiesByBudgetRange,
  type BudgetRangeMatchParams,
  type ServiceDb,
} from "./budget-range";

/**
 * The discovery/comparison side of Phase 3
 * (`docs/tasklists/2026-09-18-discovery-matches-endpoint.md`): turns a
 * buyer-stated budget range into published property summaries, by composing
 * the private matcher (`./budget-range.ts`) with the public catalog read
 * layer (`@/lib/properties/queries.ts`). Neither connection crosses into the
 * other's role — `serviceDb` only ever resolves matched identifiers, `db`
 * only ever reads already-published public data for those identifiers.
 *
 * Deliberately does not extend `ListPropertiesParams`/`listPublishedProperties`
 * — that type is the guarded public contract for `GET /api/v1/properties`
 * (see the comment on `ListPropertiesParams`), and a property-id restriction
 * used only internally here is not part of that contract.
 */

/**
 * `maxInr` (a stated upper bound) and `maxUnbounded: true` ("no upper
 * limit", resolved server-side against the catalog's current maximum current
 * price — 2026-09-18 DECISIONS.md entry) are mutually exclusive, mirroring
 * `BudgetRangeMatchParams`.
 */
export type DiscoveryMatchParams = {
  city?: string;
  bhk?: string;
  page: number;
  pageSize: number;
} & BudgetRangeMatchParams;

const emptyResult = (page: number, pageSize: number): PropertyListResult => ({
  data: [],
  pagination: { page, pageSize, total: 0, totalPages: 0 },
});

/**
 * `POST /api/v1/discovery/matches` — published property summaries whose
 * current unit price falls in the inclusive `[minInr * 0.80, maxInr * 1.20]`
 * range, optionally narrowed by `city`/`bhk`. Returns an honest empty result
 * when nothing matches rather than fabricating one (`docs/app-flows/buyer.md`'s
 * "No matching inventory" exception path).
 */
export const matchPublishedProperties = async (
  db: ReadDb,
  serviceDb: ServiceDb,
  params: DiscoveryMatchParams,
): Promise<PropertyListResult> => {
  const rangeParams: BudgetRangeMatchParams =
    "maxInr" in params
      ? { minInr: params.minInr, maxInr: params.maxInr }
      : { minInr: params.minInr, maxUnbounded: true };
  const matches = await matchPropertiesByBudgetRange(serviceDb, rangeParams);

  const matchedPropertyIds = [...new Set(matches.map((m) => m.propertyId))];
  if (matchedPropertyIds.length === 0) {
    return emptyResult(params.page, params.pageSize);
  }

  const conditions: SQL[] = [
    inArray(properties.id, matchedPropertyIds),
    isListed,
  ];
  if (params.city !== undefined) {
    conditions.push(eq(properties.city, params.city));
  }
  if (params.bhk !== undefined) {
    conditions.push(bhkFilter(params.bhk));
  }
  const where = and(...conditions);

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
    .orderBy(desc(properties.createdAt), asc(properties.id))
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
