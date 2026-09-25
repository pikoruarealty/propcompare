import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { specificationIsActive } from "@/lib/specifications/active";
import {
  amenityCatalog,
  bhkTypes,
  developers,
  layoutTypes,
  properties,
  propertyAmenities,
  propertySpecifications,
  propertyTypes,
  specificationCatalog,
  unitAreas,
  unitVariantAmenities,
  unitVariants,
} from "@/db/schema/catalog";

/**
 * The published value of each contract field, keyed by field key, for the screens
 * that set a proposed change beside what is live, that start an edit from what is
 * published, and for the RERA comparison. Read only: nothing here changes a live
 * table.
 *
 * Simple fields, the amenity set, each specification, the unit types (with their
 * areas, room dimensions and own amenities) and the developer's name and narrative are covered.
 * A field with no published value is absent, never `null`. Amenities the property
 * does not list as available are absent from the set, so "not stated" and "not
 * offered" both read as not in it.
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
      mapUrl: properties.mapUrl,
      pincode: properties.pincode,
      launchDate: properties.launchDate,
      landAreaSqft: properties.reraProjectLandAreaSqft,
      latitude: properties.latitude,
      longitude: properties.longitude,
      reraSnapshot: properties.reraSnapshot,
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
    "property.google_maps_url": row.mapUrl,
    // These were published but never read back, so a RERA check saw them as not
    // held and would have proposed them again every quarter.
    "property.pincode": row.pincode,
    "property.launch_date": row.launchDate,
    "property.rera_project_land_area_sqft":
      row.landAreaSqft === null ? null : Number(row.landAreaSqft),
    "property.latitude": row.latitude === null ? null : Number(row.latitude),
    "property.longitude": row.longitude === null ? null : Number(row.longitude),
    "property.rera_snapshot": row.reraSnapshot,
  };
  const live: Record<string, unknown> = Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== null),
  );

  const [developer] = await database
    .select({
      name: developers.name,
      profileNarrative: developers.profileNarrative,
    })
    .from(properties)
    .innerJoin(developers, eq(developers.id, properties.developerId))
    .where(eq(properties.id, propertyId));
  if (developer) {
    live["developer.name"] = developer.name;
    if (developer.profileNarrative) {
      live["developer.profile_narrative"] = developer.profileNarrative;
    }
  }

  const amenities = await database
    .select({ key: amenityCatalog.key })
    .from(propertyAmenities)
    .innerJoin(
      amenityCatalog,
      eq(amenityCatalog.id, propertyAmenities.amenityCatalogId),
    )
    .where(
      and(
        eq(propertyAmenities.propertyId, propertyId),
        eq(propertyAmenities.status, "available"),
      ),
    )
    .orderBy(asc(amenityCatalog.key));
  if (amenities.length > 0) {
    live["property.amenities"] = amenities.map((row) => row.key);
  }

  const specifications = await database
    .select({
      key: specificationCatalog.key,
      valueText: propertySpecifications.valueText,
    })
    .from(propertySpecifications)
    .innerJoin(
      specificationCatalog,
      eq(
        specificationCatalog.id,
        propertySpecifications.specificationCatalogId,
      ),
    )
    .where(
      and(
        eq(propertySpecifications.propertyId, propertyId),
        eq(propertySpecifications.status, "available"),
        specificationIsActive,
      ),
    );
  for (const row of specifications) {
    if (row.valueText)
      live[`property.specifications.${row.key}`] = row.valueText;
  }

  const variants = await database
    .select({
      id: unitVariants.id,
      variantName: unitVariants.variantName,
      bhkTypeKey: bhkTypes.key,
      layoutTypeKey: layoutTypes.key,
      totalUnitsOfVariant: unitVariants.totalUnitsOfVariant,
      unitsPerFloor: unitVariants.unitsPerFloor,
      dimensions: unitVariants.dimensions,
    })
    .from(unitVariants)
    .leftJoin(bhkTypes, eq(bhkTypes.id, unitVariants.bhkTypeId))
    .leftJoin(layoutTypes, eq(layoutTypes.id, unitVariants.layoutTypeId))
    // A removed unit type is not live: listing it here would let an edit that
    // rewrites the list bring it back.
    .where(
      and(
        eq(unitVariants.propertyId, propertyId),
        isNull(unitVariants.removedAt),
      ),
    )
    .orderBy(asc(unitVariants.variantName));
  if (variants.length > 0) {
    const areas = await database
      .select({
        unitVariantId: unitAreas.unitVariantId,
        basis: unitAreas.basis,
        areaSqft: unitAreas.areaSqft,
      })
      .from(unitAreas)
      .innerJoin(unitVariants, eq(unitVariants.id, unitAreas.unitVariantId))
      .where(eq(unitVariants.propertyId, propertyId));
    const amenityRows = await database
      .select({
        unitVariantId: unitVariantAmenities.unitVariantId,
        key: amenityCatalog.key,
        status: unitVariantAmenities.status,
      })
      .from(unitVariantAmenities)
      .innerJoin(
        amenityCatalog,
        eq(amenityCatalog.id, unitVariantAmenities.amenityCatalogId),
      )
      .innerJoin(
        unitVariants,
        eq(unitVariants.id, unitVariantAmenities.unitVariantId),
      )
      .where(
        and(
          eq(unitVariants.propertyId, propertyId),
          inArray(unitVariantAmenities.status, [
            "available",
            "explicitly_not_offered",
          ]),
        ),
      )
      .orderBy(asc(amenityCatalog.key));
    live["unit_variants"] = variants.map((variant) => ({
      variantName: variant.variantName,
      ...(variant.bhkTypeKey ? { bhkTypeKey: variant.bhkTypeKey } : {}),
      ...(variant.layoutTypeKey
        ? { layoutTypeKey: variant.layoutTypeKey }
        : {}),
      ...(variant.totalUnitsOfVariant !== null
        ? { totalUnitsOfVariant: variant.totalUnitsOfVariant }
        : {}),
      ...(variant.unitsPerFloor !== null
        ? { unitsPerFloor: variant.unitsPerFloor }
        : {}),
      ...(variant.dimensions ? { dimensions: variant.dimensions } : {}),
      // Only when the unit type has any: an edit that starts from what is live
      // then carries them instead of dropping them.
      ...(amenityRows.some((row) => row.unitVariantId === variant.id)
        ? {
            amenities: amenityRows
              .filter((row) => row.unitVariantId === variant.id)
              .map((row) => ({ key: row.key, status: row.status })),
          }
        : {}),
      areas: areas
        .filter((area) => area.unitVariantId === variant.id)
        .map((area) => ({
          basis: area.basis,
          areaSqft: Number(area.areaSqft),
        })),
    }));
  }
  return live;
};
