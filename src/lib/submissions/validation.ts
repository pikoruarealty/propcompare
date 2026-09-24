import { isGoogleMapsUrl } from "@/lib/properties/map-url";
import { reraSnapshotProblem } from "@/lib/rera/snapshot";
import { LISTING_STATUSES } from "./edit-only-fields";

export class SubmissionPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubmissionPayloadError";
  }
}

export interface ActiveSubmissionField {
  fieldKey: string;
  dataType: string;
}

export interface SubmissionLookupContext {
  propertyTypeKeys: ReadonlySet<string>;
  bhkTypeKeys: ReadonlySet<string>;
  layoutTypeKeys: ReadonlySet<string>;
  amenityKeys: ReadonlySet<string>;
}

export interface SubmissionRoomDimension {
  name: string;
  lengthFt?: number;
  widthFt?: number;
  areaSqft?: number;
}

export interface SubmissionUnitVariantAreaRow {
  basis: "carpet" | "super_built_up" | "built_up";
  areaSqft: number;
}

export interface SubmissionUnitVariant {
  variantName: string;
  bhkTypeKey?: string;
  layoutTypeKey?: string;
  totalUnitsOfVariant?: number;
  unitsPerFloor?: number;
  areas?: SubmissionUnitVariantAreaRow[];
  dimensions?: {
    rooms?: SubmissionRoomDimension[];
    foyer?: SubmissionRoomDimension | null;
    balconies?: SubmissionRoomDimension[];
  };
}

export type CanonicalSubmissionPayload = Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readNonEmptyString = (value: unknown, path: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SubmissionPayloadError(`${path} must be a non-empty string`);
  }
  return value.trim();
};

const readPositiveNumber = (value: unknown, path: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new SubmissionPayloadError(`${path} must be a positive number`);
  }
  return value;
};

const readPositiveInteger = (value: unknown, path: string): number => {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new SubmissionPayloadError(`${path} must be a positive integer`);
  }
  return value as number;
};

const readRoom = (value: unknown, path: string): SubmissionRoomDimension => {
  if (!isRecord(value)) {
    throw new SubmissionPayloadError(`${path} must be an object`);
  }
  const room: SubmissionRoomDimension = {
    name: readNonEmptyString(value.name, `${path}.name`),
  };
  for (const key of ["lengthFt", "widthFt", "areaSqft"] as const) {
    if (value[key] !== undefined) {
      room[key] = readPositiveNumber(value[key], `${path}.${key}`);
    }
  }
  if (
    room.lengthFt === undefined &&
    room.widthFt === undefined &&
    room.areaSqft === undefined
  ) {
    throw new SubmissionPayloadError(
      `${path} must contain a supported measurement`,
    );
  }
  return room;
};

const readUnitVariants = (
  value: unknown,
  path: string,
  lookups: SubmissionLookupContext,
): SubmissionUnitVariant[] => {
  if (!Array.isArray(value)) {
    throw new SubmissionPayloadError(`${path} must be an array`);
  }
  const seenNames = new Set<string>();
  return value.map((candidate, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(candidate)) {
      throw new SubmissionPayloadError(`${itemPath} must be an object`);
    }
    const variantName = readNonEmptyString(
      candidate.variantName,
      `${itemPath}.variantName`,
    );
    const normalizedName = variantName.toLocaleLowerCase();
    if (seenNames.has(normalizedName)) {
      throw new SubmissionPayloadError(
        `${path} contains duplicate variant name: ${variantName}`,
      );
    }
    seenNames.add(normalizedName);

    const variant: SubmissionUnitVariant = { variantName };

    if (candidate.bhkTypeKey !== undefined) {
      const bhkTypeKey = readNonEmptyString(
        candidate.bhkTypeKey,
        `${itemPath}.bhkTypeKey`,
      );
      if (!lookups.bhkTypeKeys.has(bhkTypeKey)) {
        throw new SubmissionPayloadError(
          `${itemPath}.bhkTypeKey is not an approved BHK type`,
        );
      }
      variant.bhkTypeKey = bhkTypeKey;
    }
    if (candidate.layoutTypeKey !== undefined) {
      const layoutTypeKey = readNonEmptyString(
        candidate.layoutTypeKey,
        `${itemPath}.layoutTypeKey`,
      );
      if (!lookups.layoutTypeKeys.has(layoutTypeKey)) {
        throw new SubmissionPayloadError(
          `${itemPath}.layoutTypeKey is not an approved layout type`,
        );
      }
      variant.layoutTypeKey = layoutTypeKey;
    }
    if (candidate.totalUnitsOfVariant !== undefined) {
      variant.totalUnitsOfVariant = readPositiveInteger(
        candidate.totalUnitsOfVariant,
        `${itemPath}.totalUnitsOfVariant`,
      );
    }
    if (candidate.unitsPerFloor !== undefined) {
      variant.unitsPerFloor = readPositiveInteger(
        candidate.unitsPerFloor,
        `${itemPath}.unitsPerFloor`,
      );
    }
    if (candidate.areas !== undefined) {
      if (!Array.isArray(candidate.areas)) {
        throw new SubmissionPayloadError(`${itemPath}.areas must be an array`);
      }
      const bases = new Set<string>();
      variant.areas = candidate.areas.map((area, areaIndex) => {
        const areaPath = `${itemPath}.areas[${areaIndex}]`;
        if (!isRecord(area)) {
          throw new SubmissionPayloadError(`${areaPath} must be an object`);
        }
        if (
          !["carpet", "super_built_up", "built_up"].includes(String(area.basis))
        ) {
          throw new SubmissionPayloadError(
            `${areaPath}.basis is not supported`,
          );
        }
        const basis = area.basis as SubmissionUnitVariantAreaRow["basis"];
        if (bases.has(basis)) {
          throw new SubmissionPayloadError(
            `${itemPath}.areas contains duplicate bases`,
          );
        }
        bases.add(basis);
        return {
          basis,
          areaSqft: readPositiveNumber(area.areaSqft, `${areaPath}.areaSqft`),
        };
      });
    }
    if (candidate.dimensions !== undefined) {
      if (!isRecord(candidate.dimensions)) {
        throw new SubmissionPayloadError(
          `${itemPath}.dimensions must be an object`,
        );
      }
      const dimensions: NonNullable<SubmissionUnitVariant["dimensions"]> = {};
      if (candidate.dimensions.rooms !== undefined) {
        if (!Array.isArray(candidate.dimensions.rooms)) {
          throw new SubmissionPayloadError(
            `${itemPath}.dimensions.rooms must be an array`,
          );
        }
        dimensions.rooms = candidate.dimensions.rooms.map((room, roomIndex) =>
          readRoom(room, `${itemPath}.dimensions.rooms[${roomIndex}]`),
        );
      }
      if (candidate.dimensions.foyer !== undefined) {
        dimensions.foyer =
          candidate.dimensions.foyer === null
            ? null
            : readRoom(
                candidate.dimensions.foyer,
                `${itemPath}.dimensions.foyer`,
              );
      }
      if (candidate.dimensions.balconies !== undefined) {
        if (!Array.isArray(candidate.dimensions.balconies)) {
          throw new SubmissionPayloadError(
            `${itemPath}.dimensions.balconies must be an array`,
          );
        }
        dimensions.balconies = candidate.dimensions.balconies.map(
          (room, roomIndex) =>
            readRoom(room, `${itemPath}.dimensions.balconies[${roomIndex}]`),
        );
      }
      variant.dimensions = dimensions;
    }
    return variant;
  });
};

const validateFieldValue = (
  fieldKey: string,
  dataType: string,
  value: unknown,
  lookups: SubmissionLookupContext,
): unknown => {
  const path = fieldKey;
  const stringTypes = new Set([
    "string",
    "city_name",
    "locality_name",
    "rera_registration_number",
    "specification_text",
  ]);
  if (stringTypes.has(dataType)) {
    return readNonEmptyString(value, path);
  }
  if (dataType === "property_type_key") {
    const key = readNonEmptyString(value, path);
    if (!lookups.propertyTypeKeys.has(key)) {
      throw new SubmissionPayloadError(
        `${path} is not an approved property type`,
      );
    }
    return key;
  }
  if (dataType === "positive_integer") {
    return readPositiveInteger(value, path);
  }
  if (dataType === "positive_number") {
    const number = readPositiveNumber(value, path);
    // The project's position: a coordinate outside India is a typo, not a place.
    if (fieldKey === "property.latitude" && (number < 6 || number > 38)) {
      throw new SubmissionPayloadError(`${path} must be a latitude in India`);
    }
    if (fieldKey === "property.longitude" && (number < 68 || number > 98)) {
      throw new SubmissionPayloadError(`${path} must be a longitude in India`);
    }
    return number;
  }
  if (dataType === "rera_snapshot") {
    const problem = reraSnapshotProblem(value);
    if (problem) throw new SubmissionPayloadError(`${path} ${problem}`);
    return value;
  }
  if (dataType === "percentage_0_to_100") {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 100
    ) {
      throw new SubmissionPayloadError(`${path} must be between 0 and 100`);
    }
    return value;
  }
  if (dataType === "possession_status") {
    const allowed = [
      "under_construction",
      "ready_to_move",
      "nearing_possession",
    ];
    if (typeof value !== "string" || !allowed.includes(value)) {
      throw new SubmissionPayloadError(
        `${path} is not an approved possession status`,
      );
    }
    return value;
  }
  if (dataType === "date") {
    const parsed =
      typeof value === "string" ? new Date(`${value}T00:00:00Z`) : null;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ||
      parsed === null ||
      Number.isNaN(parsed.valueOf())
    ) {
      throw new SubmissionPayloadError(`${path} must be an ISO calendar date`);
    }
    return value;
  }
  if (dataType === "map_url") {
    const trimmed = readNonEmptyString(value, path).trim();
    if (!isGoogleMapsUrl(trimmed)) {
      throw new SubmissionPayloadError(
        `${path} must be an https Google Maps link`,
      );
    }
    return trimmed;
  }
  if (dataType === "pincode") {
    const trimmed = readNonEmptyString(value, path).trim();
    if (!/^\d{6}$/.test(trimmed)) {
      throw new SubmissionPayloadError(`${path} must be a 6-digit PIN code`);
    }
    return trimmed;
  }
  if (dataType === "amenity_key_array") {
    if (
      !Array.isArray(value) ||
      value.some((item) => typeof item !== "string" || item.trim() === "")
    ) {
      throw new SubmissionPayloadError(`${path} must contain amenity keys`);
    }
    const normalized = value.map((item) => (item as string).trim());
    if (new Set(normalized).size !== normalized.length) {
      throw new SubmissionPayloadError(
        `${path} contains duplicate amenity keys`,
      );
    }
    const unknownKey = normalized.find((key) => !lookups.amenityKeys.has(key));
    if (unknownKey !== undefined) {
      throw new SubmissionPayloadError(
        `${path} contains an unapproved amenity key: ${unknownKey}`,
      );
    }
    return normalized;
  }
  if (dataType === "legal_entity_id") {
    const id = readNonEmptyString(value, path);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    ) {
      throw new SubmissionPayloadError(`${path} must be a legal entity id`);
    }
    return id.toLowerCase();
  }
  if (dataType === "unit_variant_array") {
    return readUnitVariants(value, path, lookups);
  }
  if (dataType === "variant_name_array") {
    if (
      !Array.isArray(value) ||
      value.some(
        (item) =>
          typeof item !== "string" ||
          item.trim() === "" ||
          item.trim().length > 200,
      )
    ) {
      throw new SubmissionPayloadError(
        `${path} must be a list of unit type names`,
      );
    }
    const names = value.map((item) => (item as string).trim());
    if (
      new Set(names.map((name) => name.toLocaleLowerCase())).size !==
      names.length
    ) {
      throw new SubmissionPayloadError(`${path} names a unit type twice`);
    }
    return names;
  }
  if (dataType === "media_id") {
    if (
      typeof value !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value.trim(),
      )
    ) {
      throw new SubmissionPayloadError(`${path} must be a picture id`);
    }
    return value.trim().toLowerCase();
  }
  if (dataType === "media_id_array") {
    const ids = Array.isArray(value)
      ? value.map((item) =>
          typeof item === "string" ? item.trim().toLowerCase() : "",
        )
      : [];
    if (
      !Array.isArray(value) ||
      ids.some(
        (id) =>
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
            id,
          ),
      )
    ) {
      throw new SubmissionPayloadError(`${path} must be a list of picture ids`);
    }
    if (new Set(ids).size !== ids.length) {
      throw new SubmissionPayloadError(`${path} names a picture twice`);
    }
    return ids;
  }
  if (dataType === "listing_status") {
    if (
      typeof value !== "string" ||
      !(LISTING_STATUSES as readonly string[]).includes(value)
    ) {
      throw new SubmissionPayloadError(
        `${path} must be listed, unlisted or deleted`,
      );
    }
    return value;
  }
  throw new SubmissionPayloadError(
    `unsupported active field data type for ${fieldKey}: ${dataType}`,
  );
};

/**
 * Validates the fully assembled, reviewed field payload for a submission
 * against the active property_schema_fields contract. This is the one gate
 * shared by every submission origin (OCR, manual form, RERA cross-check) —
 * OCR candidates are shape-checked earlier in src/lib/ocr, but manual entries
 * and edited field values are validated here for the first time.
 */
export const validateSubmissionPayload = (
  payload: unknown,
  activeFields: ActiveSubmissionField[],
  lookups: SubmissionLookupContext,
): CanonicalSubmissionPayload => {
  if (!isRecord(payload)) {
    throw new SubmissionPayloadError("submission payload must be an object");
  }
  const contractByKey = new Map(
    activeFields.map((field) => [field.fieldKey, field]),
  );
  const result: CanonicalSubmissionPayload = {};
  for (const [fieldKey, value] of Object.entries(payload)) {
    const contract = contractByKey.get(fieldKey);
    if (contract === undefined) {
      throw new SubmissionPayloadError(
        `${fieldKey} is not an active submission field`,
      );
    }
    result[fieldKey] = validateFieldValue(
      fieldKey,
      contract.dataType,
      value,
      lookups,
    );
  }
  return result;
};
