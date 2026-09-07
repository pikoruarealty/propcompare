import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  amenityCatalog,
  bhkTypes,
  developers,
  layoutTypes,
  properties,
  propertyAmenities,
  propertyRevisions,
  propertySchemaFields,
  propertySpecifications,
  propertySubmissionFields,
  propertySubmissions,
  propertyTypes,
  specificationCatalog,
  unitAreas,
  unitVariants,
} from "@/db/schema/catalog";
import {
  applySubmissionTransition,
  type SubmissionActorRole,
} from "./transitions";
import { collisionSlug, slugifyPropertyName } from "./slug";
import {
  validateSubmissionPayload,
  type ActiveSubmissionField,
  type SubmissionLookupContext,
  type SubmissionUnitVariant,
} from "./validation";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PropertyInsert = typeof properties.$inferInsert;
type UnitVariantInsert = typeof unitVariants.$inferInsert;
type UnitAreaInsert = typeof unitAreas.$inferInsert;
type PropertyAmenityInsert = typeof propertyAmenities.$inferInsert;
type PropertySpecificationInsert = typeof propertySpecifications.$inferInsert;

export class SubmissionPublishError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubmissionPublishError";
  }
}

export interface PublishSubmissionParams {
  submissionId: string;
  actorUserId: string;
  actorRole: SubmissionActorRole;
}

export interface PublishSubmissionResult {
  propertyId: string;
  revisionId: string;
  isNewProperty: boolean;
}

const SPEC_FIELD_PREFIX = "property.specifications.";
const MAX_SLUG_ATTEMPTS = 5;

interface CatalogLookups {
  propertyTypeIdByKey: Map<string, string>;
  bhkTypeIdByKey: Map<string, string>;
  layoutTypeIdByKey: Map<string, string>;
  amenityCatalogRows: { id: string; key: string }[];
  specificationCatalogRows: { id: string; key: string }[];
}

const loadCatalogLookups = async (tx: Tx): Promise<CatalogLookups> => {
  const propertyTypeRows = await tx
    .select({ id: propertyTypes.id, key: propertyTypes.key })
    .from(propertyTypes);
  const bhkTypeRows = await tx
    .select({ id: bhkTypes.id, key: bhkTypes.key })
    .from(bhkTypes);
  const layoutTypeRows = await tx
    .select({ id: layoutTypes.id, key: layoutTypes.key })
    .from(layoutTypes);
  const amenityCatalogRows = await tx
    .select({ id: amenityCatalog.id, key: amenityCatalog.key })
    .from(amenityCatalog);
  const specificationCatalogRows = await tx
    .select({ id: specificationCatalog.id, key: specificationCatalog.key })
    .from(specificationCatalog);

  return {
    propertyTypeIdByKey: new Map(propertyTypeRows.map((r) => [r.key, r.id])),
    bhkTypeIdByKey: new Map(bhkTypeRows.map((r) => [r.key, r.id])),
    layoutTypeIdByKey: new Map(layoutTypeRows.map((r) => [r.key, r.id])),
    amenityCatalogRows,
    specificationCatalogRows,
  };
};

const toLookupContext = (lookups: CatalogLookups): SubmissionLookupContext => ({
  propertyTypeKeys: new Set(lookups.propertyTypeIdByKey.keys()),
  bhkTypeKeys: new Set(lookups.bhkTypeIdByKey.keys()),
  layoutTypeKeys: new Set(lookups.layoutTypeIdByKey.keys()),
  amenityKeys: new Set(lookups.amenityCatalogRows.map((row) => row.key)),
});

const requireLookup = (id: string | undefined, message: string): string => {
  if (id === undefined) {
    throw new SubmissionPublishError(message);
  }
  return id;
};

/**
 * Resolves the unique property slug for a new-property publish. Pre-checks
 * existence via SELECT rather than catching an INSERT unique violation,
 * because a mid-transaction error would abort every subsequent statement in
 * the same `db.transaction()` (no SAVEPOINT is used here).
 */
const resolveNewPropertySlug = async (
  tx: Tx,
  submissionId: string,
  propertyName: string,
): Promise<string> => {
  const baseSlug = slugifyPropertyName(propertyName);
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const candidate =
      attempt === 0 ? baseSlug : collisionSlug(baseSlug, submissionId, attempt);
    const [existing] = await tx
      .select({ id: properties.id })
      .from(properties)
      .where(eq(properties.slug, candidate));
    if (!existing) {
      return candidate;
    }
  }
  throw new SubmissionPublishError(
    "unable to generate a unique property slug after multiple attempts",
  );
};

/**
 * The one write path into the live catalog tables (`properties`, `developers`,
 * `unit_variants`, `unit_areas`, `property_amenities`,
 * `property_specifications`) — see AGENTS.md. It applies exactly one
 * approved submission's reviewed field values and writes a matching
 * `property_revisions` snapshot, all inside one transaction.
 */
export const publishSubmission = async (
  params: PublishSubmissionParams,
): Promise<PublishSubmissionResult> => {
  return db.transaction(async (tx) => {
    const [submission] = await tx
      .select()
      .from(propertySubmissions)
      .where(eq(propertySubmissions.id, params.submissionId))
      .for("update");

    if (!submission) {
      throw new SubmissionPublishError(
        `submission not found: ${params.submissionId}`,
      );
    }

    const transitionResult = applySubmissionTransition({
      currentStatus: submission.status,
      action: "publish",
      actorRole: params.actorRole,
    });

    const submissionFields = await tx
      .select()
      .from(propertySubmissionFields)
      .where(eq(propertySubmissionFields.submissionId, submission.id));

    const pendingReview = submissionFields.find(
      (field) => field.reviewStatus === "needs_review",
    );
    if (pendingReview) {
      throw new SubmissionPublishError(
        `field ${pendingReview.fieldKey} is still needs_review and blocks publication`,
      );
    }

    const activeFields: ActiveSubmissionField[] = await tx
      .select({
        fieldKey: propertySchemaFields.fieldKey,
        dataType: propertySchemaFields.dataType,
      })
      .from(propertySchemaFields)
      .where(eq(propertySchemaFields.isActive, true));
    const activeFieldKeys = new Set(activeFields.map((f) => f.fieldKey));

    const rawPayload: Record<string, unknown> = {};
    for (const field of submissionFields) {
      if (field.reviewStatus === "rejected") continue;
      if (!activeFieldKeys.has(field.fieldKey)) continue;
      rawPayload[field.fieldKey] = field.value;
    }

    const lookups = await loadCatalogLookups(tx);
    const payload = validateSubmissionPayload(
      rawPayload,
      activeFields,
      toLookupContext(lookups),
    );

    const getStringField = (key: string): string | undefined => {
      const value = payload[key];
      return typeof value === "string" ? value : undefined;
    };
    const getNumberField = (key: string): number | undefined => {
      const value = payload[key];
      return typeof value === "number" ? value : undefined;
    };
    const readPercentField = (key: string): string | undefined => {
      const value = getNumberField(key);
      return value === undefined ? undefined : String(value);
    };

    const name = getStringField("property.name");
    const propertyTypeKey = getStringField("property.type");
    const city = getStringField("property.city");
    const locality = getStringField("property.locality");
    const possessionStatusValue = getStringField(
      "property.possession_status",
    ) as PropertyInsert["possessionStatus"] | undefined;
    const possessionDate = getStringField("property.possession_date");
    const totalTowers = getNumberField("property.total_towers");
    const totalFloors = getNumberField("property.total_floors");
    const totalUnits = getNumberField("property.total_units");
    const plotArea = getNumberField("property.plot_area_sqft");
    const developerProfileNarrative = getStringField(
      "developer.profile_narrative",
    );
    const reraRegistrationNumber = getStringField(
      "property.rera_registration_number",
    );
    const reraConstructionProgressPercent = readPercentField(
      "property.rera_construction_progress_percent",
    );

    const isNewProperty = submission.propertyId === null;
    let propertyId: string;

    if (isNewProperty) {
      if (!name || !propertyTypeKey || !city || !locality) {
        throw new SubmissionPublishError(
          "new property publication requires property.name, property.type, property.city, and property.locality",
        );
      }
      if (!submission.developerId) {
        throw new SubmissionPublishError(
          "new property publication requires developer_id on the submission",
        );
      }
      const propertyTypeId = requireLookup(
        lookups.propertyTypeIdByKey.get(propertyTypeKey),
        `unknown property type key: ${propertyTypeKey}`,
      );
      const slug = await resolveNewPropertySlug(tx, submission.id, name);

      const [inserted] = await tx
        .insert(properties)
        .values({
          name,
          slug,
          propertyTypeId,
          developerId: submission.developerId,
          city,
          locality,
          possessionStatus: possessionStatusValue,
          possessionDate,
          totalTowers,
          totalFloors,
          totalUnits,
          plotAreaSqft: plotArea === undefined ? undefined : String(plotArea),
          reraRegistrationNumber,
          reraConstructionProgressPercent,
        })
        .returning({ id: properties.id });
      propertyId = inserted.id;
    } else {
      propertyId = submission.propertyId as string;

      const updateColumns: Partial<PropertyInsert> = {};
      if (name !== undefined) updateColumns.name = name;
      if (propertyTypeKey !== undefined) {
        updateColumns.propertyTypeId = requireLookup(
          lookups.propertyTypeIdByKey.get(propertyTypeKey),
          `unknown property type key: ${propertyTypeKey}`,
        );
      }
      if (city !== undefined) updateColumns.city = city;
      if (locality !== undefined) updateColumns.locality = locality;
      if (possessionStatusValue !== undefined) {
        updateColumns.possessionStatus = possessionStatusValue;
      }
      if (possessionDate !== undefined) {
        updateColumns.possessionDate = possessionDate;
      }
      if (totalTowers !== undefined) updateColumns.totalTowers = totalTowers;
      if (totalFloors !== undefined) updateColumns.totalFloors = totalFloors;
      if (totalUnits !== undefined) updateColumns.totalUnits = totalUnits;
      if (plotArea !== undefined) updateColumns.plotAreaSqft = String(plotArea);
      if (reraRegistrationNumber !== undefined) {
        updateColumns.reraRegistrationNumber = reraRegistrationNumber;
      }
      if (reraConstructionProgressPercent !== undefined) {
        updateColumns.reraConstructionProgressPercent =
          reraConstructionProgressPercent;
      }

      if (Object.keys(updateColumns).length > 0) {
        await tx
          .update(properties)
          .set(updateColumns)
          .where(eq(properties.id, propertyId));
      }
    }

    if (developerProfileNarrative !== undefined) {
      let targetDeveloperId = submission.developerId;
      if (!isNewProperty) {
        const [propertyDeveloper] = await tx
          .select({ developerId: properties.developerId })
          .from(properties)
          .where(eq(properties.id, propertyId));
        targetDeveloperId = propertyDeveloper?.developerId ?? null;
      }
      if (!targetDeveloperId) {
        throw new SubmissionPublishError(
          "developer.profile_narrative requires a canonical developer",
        );
      }
      await tx
        .update(developers)
        .set({ profileNarrative: developerProfileNarrative })
        .where(eq(developers.id, targetDeveloperId));
    }

    const submittedVariants = payload["unit_variants"] as
      SubmissionUnitVariant[] | undefined;
    if (submittedVariants) {
      for (const variant of submittedVariants) {
        const bhkTypeId = variant.bhkTypeKey
          ? requireLookup(
              lookups.bhkTypeIdByKey.get(variant.bhkTypeKey),
              `unknown bhk type key: ${variant.bhkTypeKey}`,
            )
          : null;
        const layoutTypeId = variant.layoutTypeKey
          ? requireLookup(
              lookups.layoutTypeIdByKey.get(variant.layoutTypeKey),
              `unknown layout type key: ${variant.layoutTypeKey}`,
            )
          : null;

        const variantValues: UnitVariantInsert = {
          propertyId,
          variantName: variant.variantName,
          bhkTypeId,
          layoutTypeId,
          totalUnitsOfVariant: variant.totalUnitsOfVariant ?? null,
          unitsPerFloor: variant.unitsPerFloor ?? null,
          dimensions: variant.dimensions ?? null,
        };

        const [variantRow] = await tx
          .insert(unitVariants)
          .values(variantValues)
          .onConflictDoUpdate({
            target: [unitVariants.propertyId, unitVariants.variantName],
            set: {
              bhkTypeId: variantValues.bhkTypeId,
              layoutTypeId: variantValues.layoutTypeId,
              totalUnitsOfVariant: variantValues.totalUnitsOfVariant,
              unitsPerFloor:
                variant.unitsPerFloor === undefined
                  ? unitVariants.unitsPerFloor
                  : variantValues.unitsPerFloor,
              dimensions: variantValues.dimensions,
            },
          })
          .returning({ id: unitVariants.id });

        if (variant.areas) {
          for (const area of variant.areas) {
            const areaValues: UnitAreaInsert = {
              unitVariantId: variantRow.id,
              basis: area.basis,
              areaSqft: String(area.areaSqft),
            };
            await tx
              .insert(unitAreas)
              .values(areaValues)
              .onConflictDoUpdate({
                target: [unitAreas.unitVariantId, unitAreas.basis],
                set: { areaSqft: areaValues.areaSqft },
              });
          }
        }
      }
    }

    const selectedAmenityKeys = new Set(
      Array.isArray(payload["property.amenities"])
        ? (payload["property.amenities"] as string[])
        : [],
    );
    if (isNewProperty) {
      const amenityRows: PropertyAmenityInsert[] =
        lookups.amenityCatalogRows.map((row) => ({
          propertyId,
          amenityCatalogId: row.id,
          status: selectedAmenityKeys.has(row.key) ? "available" : "not_stated",
        }));
      if (amenityRows.length > 0) {
        await tx.insert(propertyAmenities).values(amenityRows);
      }
    } else if (selectedAmenityKeys.size > 0) {
      const amenityRows: PropertyAmenityInsert[] = lookups.amenityCatalogRows
        .filter((row) => selectedAmenityKeys.has(row.key))
        .map((row) => ({
          propertyId,
          amenityCatalogId: row.id,
          status: "available",
        }));
      if (amenityRows.length > 0) {
        await tx
          .insert(propertyAmenities)
          .values(amenityRows)
          .onConflictDoUpdate({
            target: [
              propertyAmenities.propertyId,
              propertyAmenities.amenityCatalogId,
            ],
            set: { status: "available" },
          });
      }
    }

    const submittedSpecs = new Map<string, string>();
    for (const [fieldKey, value] of Object.entries(payload)) {
      if (fieldKey.startsWith(SPEC_FIELD_PREFIX) && typeof value === "string") {
        submittedSpecs.set(fieldKey.slice(SPEC_FIELD_PREFIX.length), value);
      }
    }
    if (isNewProperty) {
      const specRows: PropertySpecificationInsert[] =
        lookups.specificationCatalogRows.map((row) => {
          const value = submittedSpecs.get(row.key);
          return {
            propertyId,
            specificationCatalogId: row.id,
            valueText: value ?? null,
            status: value !== undefined ? "available" : "not_stated",
          };
        });
      if (specRows.length > 0) {
        await tx.insert(propertySpecifications).values(specRows);
      }
    } else if (submittedSpecs.size > 0) {
      const specRows: PropertySpecificationInsert[] =
        lookups.specificationCatalogRows
          .filter((row) => submittedSpecs.has(row.key))
          .map((row) => ({
            propertyId,
            specificationCatalogId: row.id,
            valueText: submittedSpecs.get(row.key) ?? null,
            status: "available",
          }));
      if (specRows.length > 0) {
        await tx
          .insert(propertySpecifications)
          .values(specRows)
          .onConflictDoUpdate({
            target: [
              propertySpecifications.propertyId,
              propertySpecifications.specificationCatalogId,
            ],
            set: {
              valueText: sql`excluded.value_text`,
              status: sql`excluded.status`,
            },
          });
      }
    }

    const now = new Date();
    const [revision] = await tx
      .insert(propertyRevisions)
      .values({
        propertyId,
        submissionId: submission.id,
        snapshot: {
          propertyId,
          submissionId: submission.id,
          isNewProperty,
          fields: payload,
        },
        publishedAt: now,
      })
      .returning({ id: propertyRevisions.id });

    const updatedSubmission = await tx
      .update(propertySubmissions)
      .set({
        status: transitionResult.nextStatus,
        publishedAt: now,
        propertyId,
        reviewedBy: params.actorUserId,
        payload,
      })
      .where(
        and(
          eq(propertySubmissions.id, submission.id),
          eq(propertySubmissions.status, "approved"),
        ),
      )
      .returning({ id: propertySubmissions.id });

    if (updatedSubmission.length === 0) {
      throw new SubmissionPublishError(
        "submission status changed concurrently; publish aborted",
      );
    }

    return { propertyId, revisionId: revision.id, isNewProperty };
  });
};
