import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { properties, propertyTypes } from "@/db/schema/catalog";

/**
 * The published value of each simple contract field, keyed by field key, for the
 * screens that set a proposed change beside what is live and for the RERA
 * comparison. Read only: nothing here changes a live table.
 *
 * Only single-value fields are here. Amenities, specifications, unit types and
 * pictures are not summarised this way; an edit that leaves them out keeps what is
 * published. A field with no published value is absent, never `null`.
 */
export const loadLiveValues = async (
  database: PostgresJsDatabase,
  propertyId: string,
): Promise<Record<string, unknown>> => {
  const [row] = await database
    .select({
      name: properties.name,
      typeKey: propertyTypes.key,
      city: properties.city,
      locality: properties.locality,
      possessionStatus: properties.possessionStatus,
      possessionDate: properties.possessionDate,
      totalTowers: properties.totalTowers,
      totalFloors: properties.totalFloors,
      totalUnits: properties.totalUnits,
      plotArea: properties.plotAreaSqft,
      reraNumber: properties.reraRegistrationNumber,
      progress: properties.reraConstructionProgressPercent,
      legalEntityId: properties.legalEntityId,
    })
    .from(properties)
    .innerJoin(propertyTypes, eq(propertyTypes.id, properties.propertyTypeId))
    .where(eq(properties.id, propertyId));
  if (!row) return {};

  const values: Record<string, unknown> = {
    "property.name": row.name,
    "property.type": row.typeKey,
    "property.city": row.city,
    "property.locality": row.locality,
    "property.possession_status": row.possessionStatus,
    "property.possession_date": row.possessionDate,
    "property.total_towers": row.totalTowers,
    "property.total_floors": row.totalFloors,
    "property.total_units": row.totalUnits,
    "property.plot_area_sqft":
      row.plotArea === null ? null : Number(row.plotArea),
    "property.rera_registration_number": row.reraNumber,
    "property.rera_construction_progress_percent":
      row.progress === null ? null : Number(row.progress),
    "property.legal_entity_id": row.legalEntityId,
  };
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== null),
  );
};
