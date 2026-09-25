import {
  applyPricesAfterPublish,
  type ApplyPricesResult,
} from "@/lib/pricing/apply";
import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  amenityCatalog,
  bhkTypes,
  developers,
  layoutTypes,
  properties,
  propertyAmenities,
  propertyMedia,
  propertyRevisions,
  propertySchemaFields,
  propertySpecifications,
  propertySubmissionFields,
  propertySubmissionMedia,
  propertySubmissions,
  propertyTypes,
  specificationCatalog,
  unitAreas,
  unitVariantAmenities,
  unitVariants,
} from "@/db/schema/catalog";
import { legalEntityBelongsToDeveloper } from "@/lib/developers/legal-entities";
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
type UnitVariantAmenityInsert = typeof unitVariantAmenities.$inferInsert;
type PropertySpecificationInsert = typeof propertySpecifications.$inferInsert;
type PropertyMediaInsert = typeof propertyMedia.$inferInsert;

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
  /**
   * Run every step, including the validation and the writes, then roll the whole
   * transaction back so nothing is kept. Answers "would this publish?" with the
   * real code path and no side effect. Used by the pre-publish rehearsal script.
   */
  dryRun?: boolean;
}

export interface PublishSubmissionResult {
  propertyId: string;
  revisionId: string;
  isNewProperty: boolean;
  /** Set when unit-type prices an admin typed were applied after the commit, or could
   * not be (`failed`); absent when there were none. Never affects whether the
   * property published. */
  prices?: ApplyPricesResult & { failed: boolean };
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

/** A property may only name a legal entity that belongs to its own developer. */
const assertLegalEntityBelongs = async (
  tx: Tx,
  legalEntityId: string | undefined,
  developerId: string | null,
): Promise<void> => {
  if (legalEntityId === undefined) return;
  if (!(await legalEntityBelongsToDeveloper(tx, legalEntityId, developerId))) {
    throw new SubmissionPublishError(
      "property.legal_entity_id must be a legal entity of the property's developer",
    );
  }
};

/**
 * The one write path into the live catalog tables (`properties`, `developers`,
 * `unit_variants`, `unit_areas`, `property_amenities`, `unit_variant_amenities`,
 * `property_specifications`, `property_media`) — see AGENTS.md. It applies exactly one
 * approved submission's reviewed field values and writes a matching
 * `property_revisions` snapshot, all inside one transaction.
 */
class DryRunRollback extends Error {
  constructor(
    public readonly outcome: { propertyId: string; isNewProperty: boolean },
  ) {
    super("dry run: rolled back");
  }
}

export const publishSubmission = async (
  params: PublishSubmissionParams,
): Promise<PublishSubmissionResult> => {
  try {
    const published = await runPublish(params);
    // The publish transaction runs on the app role, which cannot touch the private
    // schema, so admin-typed prices are applied in a second step on the service
    // role once it has committed (`DECISIONS.md` 2026-09-24, "price data").
    const prices = await applyPricesAfterPublish({
      submissionId: params.submissionId,
      propertyId: published.propertyId,
    });
    const anything =
      prices.failed ||
      prices.applied.length + prices.unchanged.length + prices.unknown.length >
        0;
    return anything ? { ...published, prices } : published;
  } catch (error) {
    if (error instanceof DryRunRollback) {
      return {
        propertyId: error.outcome.propertyId,
        revisionId: "dry-run",
        isNewProperty: error.outcome.isNewProperty,
      };
    }
    throw error;
  }
};

const runPublish = async (
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

    const submissionMedia = await tx
      .select()
      .from(propertySubmissionMedia)
      .where(eq(propertySubmissionMedia.submissionId, submission.id))
      .for("update");

    const pendingMediaReview = submissionMedia.find(
      (media) => media.reviewStatus === "needs_review",
    );
    if (pendingMediaReview) {
      throw new SubmissionPublishError(
        `media ${pendingMediaReview.id} is still needs_review and blocks publication`,
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

    // A value on a retired field is ignored below, so it is not asked of a
    // reviewer either: a candidate nothing will publish must not block the rest.
    const pendingReview = submissionFields.find(
      (field) =>
        field.reviewStatus === "needs_review" &&
        activeFieldKeys.has(field.fieldKey),
    );
    if (pendingReview) {
      throw new SubmissionPublishError(
        `field ${pendingReview.fieldKey} is still needs_review and blocks publication`,
      );
    }

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
    const launchDate = getStringField("property.launch_date");
    const pincode = getStringField("property.pincode");
    const mapUrl = getStringField("property.google_maps_url");
    const totalTowers = getNumberField("property.total_towers");
    const totalFloors = getNumberField("property.total_floors");
    const totalUnits = getNumberField("property.total_units");
    const plotArea = getNumberField("property.plot_area_sqft");
    const reraProjectLandArea = getNumberField(
      "property.rera_project_land_area_sqft",
    );
    const latitude = getNumberField("property.latitude");
    const longitude = getNumberField("property.longitude");
    const reraSnapshot = payload["property.rera_snapshot"];
    const developerProfileNarrative = getStringField(
      "developer.profile_narrative",
    );
    // A developer's name is changed only by an edit of an existing property. On a
    // new property the field is a proposal (a brochure prints a legal name, not
    // necessarily the brand) and the canonical developer already chosen stands.
    const developerName = getStringField("developer.name")?.trim();
    // Admin changes to a live listing (schema v8); never present on a new property.
    const listingStatusValue = getStringField("property.listing_status") as
      PropertyInsert["listingStatus"] | undefined;
    const removedAmenityKeys = Array.isArray(
      payload["property.amenities_removed"],
    )
      ? (payload["property.amenities_removed"] as string[])
      : [];
    const removedMediaIds = Array.isArray(payload["property.media_removed"])
      ? (payload["property.media_removed"] as string[])
      : [];
    const removedVariantNames = Array.isArray(payload["unit_variants_removed"])
      ? (payload["unit_variants_removed"] as string[])
      : [];
    const reraRegistrationNumber = getStringField(
      "property.rera_registration_number",
    );
    // A registration number on record is what "registered" means (comparison
    // review, 2026-09-22): the flag is derived from the number, not a separate
    // choice, and is set the moment a number is confirmed by any submission.
    const reraRegistered =
      reraRegistrationNumber === undefined ? undefined : true;
    const legalEntityId = getStringField("property.legal_entity_id");
    const reraConstructionProgressPercent = readPercentField(
      "property.rera_construction_progress_percent",
    );

    const isNewProperty = submission.propertyId === null;
    let propertyId: string;

    if (
      isNewProperty &&
      (removedAmenityKeys.length > 0 ||
        removedVariantNames.length > 0 ||
        removedMediaIds.length > 0 ||
        (listingStatusValue !== undefined && listingStatusValue !== "listed"))
    ) {
      throw new SubmissionPublishError(
        "removals and listing status apply to an existing property only",
      );
    }

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
      await assertLegalEntityBelongs(tx, legalEntityId, submission.developerId);

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
          launchDate,
          pincode,
          mapUrl,
          totalTowers,
          totalFloors,
          totalUnits,
          plotAreaSqft: plotArea === undefined ? undefined : String(plotArea),
          legalEntityId,
          reraRegistrationNumber,
          reraRegistered,
          reraConstructionProgressPercent,
          reraProjectLandAreaSqft:
            reraProjectLandArea === undefined
              ? undefined
              : String(reraProjectLandArea),
          latitude: latitude === undefined ? undefined : String(latitude),
          longitude: longitude === undefined ? undefined : String(longitude),
          reraSnapshot: reraSnapshot === undefined ? undefined : reraSnapshot,
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
      if (launchDate !== undefined) updateColumns.launchDate = launchDate;
      if (pincode !== undefined) updateColumns.pincode = pincode;
      if (mapUrl !== undefined) updateColumns.mapUrl = mapUrl;
      if (totalTowers !== undefined) updateColumns.totalTowers = totalTowers;
      if (totalFloors !== undefined) updateColumns.totalFloors = totalFloors;
      if (totalUnits !== undefined) updateColumns.totalUnits = totalUnits;
      if (plotArea !== undefined) updateColumns.plotAreaSqft = String(plotArea);
      if (reraProjectLandArea !== undefined) {
        updateColumns.reraProjectLandAreaSqft = String(reraProjectLandArea);
      }
      if (latitude !== undefined) updateColumns.latitude = String(latitude);
      if (longitude !== undefined) updateColumns.longitude = String(longitude);
      if (reraSnapshot !== undefined) updateColumns.reraSnapshot = reraSnapshot;
      if (listingStatusValue !== undefined) {
        updateColumns.listingStatus = listingStatusValue;
        updateColumns.listingStatusChangedAt = new Date();
      }
      if (legalEntityId !== undefined) {
        const [owner] = await tx
          .select({ developerId: properties.developerId })
          .from(properties)
          .where(eq(properties.id, propertyId));
        await assertLegalEntityBelongs(
          tx,
          legalEntityId,
          owner?.developerId ?? null,
        );
        updateColumns.legalEntityId = legalEntityId;
      }
      if (reraRegistrationNumber !== undefined) {
        updateColumns.reraRegistrationNumber = reraRegistrationNumber;
        updateColumns.reraRegistered = true;
      } else {
        // Not part of this edit, but the property may already carry a number
        // from an earlier submission, published before `reraRegistered` was
        // derived (2026-09-22). Fill the gap the moment any edit touches the
        // property, rather than leaving it wrong until someone next changes
        // the number itself.
        const [current] = await tx
          .select({
            reraRegistrationNumber: properties.reraRegistrationNumber,
            reraRegistered: properties.reraRegistered,
          })
          .from(properties)
          .where(eq(properties.id, propertyId));
        if (current?.reraRegistrationNumber && !current.reraRegistered) {
          updateColumns.reraRegistered = true;
        }
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

    if (!isNewProperty && developerName) {
      const [propertyDeveloper] = await tx
        .select({ developerId: properties.developerId })
        .from(properties)
        .where(eq(properties.id, propertyId));
      if (!propertyDeveloper) {
        throw new SubmissionPublishError(
          "developer.name requires a canonical developer",
        );
      }
      await tx
        .update(developers)
        .set({ name: developerName })
        .where(eq(developers.id, propertyDeveloper.developerId));
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
              // Listing a type again brings back one that was removed.
              removedAt: null,
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

        // A unit type's own amenities (schema v11). The list a submission carries is
        // the whole set for this unit type: what it names is written, anything else
        // goes back to not stated. A unit type that carries no list is left alone.
        if (variant.amenities) {
          const idByKey = new Map(
            lookups.amenityCatalogRows.map((row) => [row.key, row.id]),
          );
          const rows: UnitVariantAmenityInsert[] = variant.amenities.map(
            (entry) => ({
              unitVariantId: variantRow.id,
              amenityCatalogId: requireLookup(
                idByKey.get(entry.key),
                `unknown amenity key: ${entry.key}`,
              ),
              status: entry.status,
            }),
          );
          const keptIds = rows.map((row) => row.amenityCatalogId);
          await tx
            .delete(unitVariantAmenities)
            .where(
              and(
                eq(unitVariantAmenities.unitVariantId, variantRow.id),
                keptIds.length > 0
                  ? notInArray(unitVariantAmenities.amenityCatalogId, keptIds)
                  : undefined,
              ),
            );
          if (rows.length > 0) {
            await tx
              .insert(unitVariantAmenities)
              .values(rows)
              .onConflictDoUpdate({
                target: [
                  unitVariantAmenities.unitVariantId,
                  unitVariantAmenities.amenityCatalogId,
                ],
                set: { status: sql`excluded.status` },
              });
          }
        }
      }
    }

    if (removedVariantNames.length > 0) {
      const kept = new Set(
        (submittedVariants ?? []).map((variant) =>
          variant.variantName.toLocaleLowerCase(),
        ),
      );
      for (const name of removedVariantNames) {
        if (kept.has(name.toLocaleLowerCase())) {
          throw new SubmissionPublishError(
            `unit type "${name}" is both kept and removed`,
          );
        }
        const removed = await tx
          .update(unitVariants)
          .set({ removedAt: new Date() })
          .where(
            and(
              eq(unitVariants.propertyId, propertyId),
              sql`lower(${unitVariants.variantName}) = ${name.toLocaleLowerCase()}`,
              isNull(unitVariants.removedAt),
            ),
          )
          .returning({ id: unitVariants.id });
        if (removed.length === 0) {
          throw new SubmissionPublishError(
            `unit type "${name}" is not a live unit type of this property`,
          );
        }
      }
    }

    // Pictures an edit takes off the listing (schema v9): soft, and only pictures
    // that are live pictures of this property. A replacement is a removal plus a
    // new picture in the same edit.
    if (removedMediaIds.length > 0) {
      const removedPictures = await tx
        .update(propertyMedia)
        .set({ removedAt: new Date() })
        .where(
          and(
            eq(propertyMedia.propertyId, propertyId),
            inArray(propertyMedia.id, removedMediaIds),
            isNull(propertyMedia.removedAt),
          ),
        )
        .returning({ id: propertyMedia.id });
      if (removedPictures.length !== removedMediaIds.length) {
        throw new SubmissionPublishError(
          "a picture to remove is not a live picture of this property",
        );
      }
    }

    // The project's main photo (schema v14): the one picture that stands for it on
    // cards, comparison columns and the dossier. Exactly one per property, and it
    // must be a photo that is live after this publish: either a new picture this
    // submission approves, or a live picture this edit does not remove. Choosing
    // one replaces the previous main photo in the same transaction.
    const mainPhotoId = getStringField("property.main_photo");
    let mainCandidateId: string | undefined;
    if (mainPhotoId !== undefined) {
      const candidate = submissionMedia.find(
        (media) => media.id === mainPhotoId,
      );
      let mainLiveId: string | undefined;
      if (candidate) {
        if (
          candidate.mediaType !== "photo" ||
          candidate.reviewStatus !== "confirmed" ||
          !candidate.isPublic
        ) {
          throw new SubmissionPublishError(
            "the main photo must be an approved, public photo; choose another or approve this one",
          );
        }
        mainCandidateId = candidate.id;
      } else {
        const [live] = await tx
          .select({
            id: propertyMedia.id,
            mediaType: propertyMedia.mediaType,
            removedAt: propertyMedia.removedAt,
          })
          .from(propertyMedia)
          .where(
            and(
              eq(propertyMedia.id, mainPhotoId),
              eq(propertyMedia.propertyId, propertyId),
            ),
          );
        if (
          !live ||
          live.removedAt !== null ||
          live.mediaType !== "photo" ||
          removedMediaIds.includes(mainPhotoId)
        ) {
          throw new SubmissionPublishError(
            "the main photo is not a live photo of this property",
          );
        }
        mainLiveId = live.id;
      }
      await tx
        .update(propertyMedia)
        .set({ isPrimary: false })
        .where(
          and(
            eq(propertyMedia.propertyId, propertyId),
            eq(propertyMedia.isPrimary, true),
          ),
        );
      if (mainLiveId !== undefined) {
        await tx
          .update(propertyMedia)
          .set({ isPrimary: true })
          .where(eq(propertyMedia.id, mainLiveId));
      }
    }

    const publicConfirmedMedia = submissionMedia.filter(
      (media) => media.reviewStatus === "confirmed" && media.isPublic,
    );
    if (publicConfirmedMedia.length > 0) {
      const targetedNames = new Set(
        publicConfirmedMedia.flatMap((media) =>
          media.unitVariantName === null ? [] : [media.unitVariantName],
        ),
      );
      const variantIdByName = new Map<string, string>();
      if (targetedNames.size > 0) {
        const variants = await tx
          .select({
            id: unitVariants.id,
            variantName: unitVariants.variantName,
          })
          .from(unitVariants)
          .where(eq(unitVariants.propertyId, propertyId));
        for (const variant of variants) {
          variantIdByName.set(variant.variantName, variant.id);
        }
      }

      const mediaRows: PropertyMediaInsert[] = publicConfirmedMedia.map(
        (media) => {
          const unitVariantId =
            media.unitVariantName === null
              ? null
              : variantIdByName.get(media.unitVariantName);
          if (media.unitVariantName !== null && unitVariantId === undefined) {
            throw new SubmissionPublishError(
              `media ${media.id} targets unknown unit variant: ${media.unitVariantName}`,
            );
          }
          return {
            propertyId,
            unitVariantId,
            mediaType: media.mediaType,
            gcsPath: media.gcsPath,
            caption: media.caption,
            attribution: media.attribution,
            sourceKind: media.sourceKind,
            displayOrder: media.displayOrder,
            isPrimary: media.id === mainCandidateId,
          };
        },
      );
      await tx.insert(propertyMedia).values(mediaRows);
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

    if (removedAmenityKeys.length > 0) {
      const clash = removedAmenityKeys.find((key) =>
        selectedAmenityKeys.has(key),
      );
      if (clash !== undefined) {
        throw new SubmissionPublishError(
          `amenity "${clash}" is both kept and removed`,
        );
      }
      const ids = lookups.amenityCatalogRows
        .filter((row) => removedAmenityKeys.includes(row.key))
        .map((row) => row.id);
      if (ids.length > 0) {
        // Back to not stated; one marked "not offered" stays as it is.
        await tx
          .update(propertyAmenities)
          .set({ status: "not_stated" })
          .where(
            and(
              eq(propertyAmenities.propertyId, propertyId),
              eq(propertyAmenities.status, "available"),
              inArray(propertyAmenities.amenityCatalogId, ids),
            ),
          );
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
          media: publicConfirmedMedia.map((media) => ({
            id: media.id,
            unitVariantName: media.unitVariantName,
            mediaType: media.mediaType,
            sourceKind: media.sourceKind,
            gcsPath: media.gcsPath,
            caption: media.caption,
            attribution: media.attribution,
            displayOrder: media.displayOrder,
          })),
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

    if (params.dryRun) throw new DryRunRollback({ propertyId, isNewProperty });
    return { propertyId, revisionId: revision.id, isNewProperty };
  });
};
