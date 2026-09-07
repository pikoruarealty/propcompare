/**
 * The vocabularies the browse screen's filter controls are built from.
 *
 * This is not part of the buyer API contract and deliberately has no route: it
 * exists because a filter control needs real options. The alternative — free
 * text boxes asking a buyer to type `2bhk` — would be a lookup-key contract
 * leaking into the UI.
 *
 * **Every option is derived from published data**, not from the catalog tables
 * in full. A filter offered from the amenity catalog at large would include
 * amenities no published property records, so selecting one would return an
 * empty page and read as a broken screen. Offering only what can match keeps
 * the control honest, and prunes itself as the catalog grows.
 *
 * Read-only, and the database handle is a parameter for the same reason it is
 * in `./queries`: `@/db` throws at import time without `DATABASE_URL`.
 */

import { asc, eq } from "drizzle-orm";
import {
  amenityCatalog,
  bhkTypes,
  properties,
  propertyAmenities,
  propertyTypes,
  unitVariants,
} from "@/db/schema/catalog";
import type { ReadDb } from "./queries";
import type { LookupRef } from "./types";

export interface FilterOptions {
  cities: string[];
  localities: string[];
  propertyTypes: LookupRef[];
  bhkTypes: LookupRef[];
  amenities: LookupRef[];
}

/**
 * What the filters offer when nothing is published, and what a test that does
 * not care about vocabularies can pass. An empty catalog offers no filters
 * rather than filters that cannot match anything.
 */
export const EMPTY_FILTER_OPTIONS: FilterOptions = {
  cities: [],
  localities: [],
  propertyTypes: [],
  bhkTypes: [],
  amenities: [],
};

/**
 * `possessionStatus` has no entry here on purpose. It is a fixed database enum
 * rather than a catalog table, so its three values are known at compile time
 * (`POSSESSION_STATUS_LABEL` in `./browse`) and need no query.
 */
export const listFilterOptions = async (db: ReadDb): Promise<FilterOptions> => {
  const [cityRows, localityRows, propertyTypeRows, bhkRows, amenityRows] =
    await Promise.all([
      db
        .selectDistinct({ city: properties.city })
        .from(properties)
        .orderBy(asc(properties.city)),

      db
        .selectDistinct({ locality: properties.locality })
        .from(properties)
        .orderBy(asc(properties.locality)),

      db
        .selectDistinct({ key: propertyTypes.key, label: propertyTypes.label })
        .from(properties)
        .innerJoin(
          propertyTypes,
          eq(propertyTypes.id, properties.propertyTypeId),
        )
        .orderBy(asc(propertyTypes.label)),

      db
        .selectDistinct({ key: bhkTypes.key, label: bhkTypes.label })
        .from(unitVariants)
        .innerJoin(bhkTypes, eq(bhkTypes.id, unitVariants.bhkTypeId))
        .orderBy(asc(bhkTypes.key)),

      // Only `available` amenities, matching how the filter itself matches:
      // `not_stated` and `explicitly_not_offered` never satisfy an amenity
      // filter, so offering one that is only ever recorded in those states
      // would offer a filter guaranteed to return nothing.
      db
        .selectDistinct({
          key: amenityCatalog.key,
          label: amenityCatalog.label,
        })
        .from(propertyAmenities)
        .innerJoin(
          amenityCatalog,
          eq(amenityCatalog.id, propertyAmenities.amenityCatalogId),
        )
        .where(eq(propertyAmenities.status, "available"))
        .orderBy(asc(amenityCatalog.label)),
    ]);

  return {
    cities: cityRows.map((row) => row.city),
    localities: localityRows.map((row) => row.locality),
    propertyTypes: propertyTypeRows,
    bhkTypes: bhkRows,
    amenities: amenityRows,
  };
};
