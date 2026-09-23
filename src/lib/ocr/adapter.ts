import { mkdir, rename, writeFile, readFile } from "node:fs/promises";
import { readMeasurement } from "@/lib/units/measurements";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import {
  findRoutingScope,
  OcrContractError,
  type OcrRoutingManifest,
  type OcrUnitVariantScope,
} from "./routing";

export interface ActiveOcrField {
  fieldKey: string;
  dataType: string;
  allowedValues?: string[];
}

export interface OcrEvidenceCandidate {
  scopeKey: string;
  pageNumber: number;
  sourceSnippet?: string;
}

export interface OcrFieldCandidate {
  fieldKey: string;
  value: unknown;
  confidence?: number;
  evidence: OcrEvidenceCandidate[];
}

export interface OcrUnitVariantDetailsCandidate {
  totalUnitsOfVariant?: number;
  unitsPerFloor?: number;
  areas?: Array<{
    basis: "carpet" | "super_built_up" | "built_up";
    areaSqft: number;
  }>;
  dimensions?: {
    rooms?: OcrRoomDimension[];
    foyer?: OcrRoomDimension | null;
    balconies?: OcrRoomDimension[];
  };
}

export interface OcrRoomDimension {
  name: string;
  lengthFt?: number;
  widthFt?: number;
  areaSqft?: number;
}

export interface OcrUnitVariantCandidate {
  scopeKey: string;
  /** Present only when a v2 floor-plans scope discovered the identity itself. */
  variantName?: string;
  details: OcrUnitVariantDetailsCandidate;
  confidence?: number;
  evidence: OcrEvidenceCandidate[];
}

export interface NewPipelineExtraction {
  origin: "new_pipeline";
  pipelineVersion: string;
  fieldSchemaVersion: string;
  fields: OcrFieldCandidate[];
  unitVariants: OcrUnitVariantCandidate[];
}

export interface OcrUnmappedEvidenceCandidate {
  fieldKey: string;
  value: unknown;
  scopeKey: string;
  evidence: OcrEvidenceCandidate[];
}

export interface OcrProviderExtractionResult {
  extraction: NewPipelineExtraction;
  unmappedRawEvidence: OcrUnmappedEvidenceCandidate[];
  providerRequestIds: string[];
  usage?: OcrScopeUsage[];
  checkpointPath?: string;
  /**
   * The manifest `extraction.unitVariants[].scopeKey` actually resolves
   * against — the confirmed manifest with each `floor_plans` scope expanded
   * into the synthetic `unit_variant` scopes floor-plan unit discovery
   * produced (see `docs/tasklists/2026-09-23-floor-plan-unit-discovery.md`).
   * A caller resolving a unit variant's scope (persistence, in particular)
   * must use this, not the confirmed manifest on its own — the confirmed
   * manifest's own single `floor_plans` scope key never appears on a
   * returned unit variant. Optional so a hand-built fake result in a test
   * that predates this still type-checks; callers fall back to the
   * confirmed manifest in that case.
   */
  effectiveManifest?: OcrRoutingManifest;
}

export interface OcrScopeUsage {
  scopeKey: string;
  inputPdfBytes: number;
  providerRequestId?: string;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  costUsd?: number;
}

export interface OcrExtractionRequest {
  jobId?: string;
  sourceDocumentId: string;
  gcsPath: string;
  manifest: OcrRoutingManifest;
  pipelineVersion: string;
  fieldSchemaVersion: string;
  activeFields: ActiveOcrField[];
}

export interface OcrProviderAdapter {
  readonly providerKey: string;
  extract(request: OcrExtractionRequest): Promise<OcrProviderExtractionResult>;
}

export interface SubmissionEvidenceCandidate extends OcrEvidenceCandidate {
  valuePath: string;
}

export interface SubmissionFieldCandidate {
  fieldKey: string;
  value: unknown;
  confidence?: number;
  evidence: SubmissionEvidenceCandidate[];
}

const deduplicateSubmissionEvidence = (
  evidence: SubmissionEvidenceCandidate[],
): SubmissionEvidenceCandidate[] => {
  const unique = new Map<string, SubmissionEvidenceCandidate>();
  for (const item of evidence) {
    const key = `${item.pageNumber}\u0000${item.valuePath}`;
    const existing = unique.get(key);
    if (existing === undefined) {
      unique.set(key, item);
      continue;
    }

    const snippets = [existing.sourceSnippet, item.sourceSnippet].filter(
      (snippet): snippet is string =>
        snippet !== undefined && snippet.trim().length > 0,
    );
    const mergedSnippets = [...new Set(snippets)];
    unique.set(key, {
      ...existing,
      ...(mergedSnippets.length === 0
        ? {}
        : { sourceSnippet: mergedSnippets.join("\n") }),
    });
  }
  return [...unique.values()];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readNonEmptyString = (value: unknown, path: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new OcrContractError(`${path} must be a non-empty string`);
  }
  return value.trim();
};

const readConfidence = (value: unknown, path: string): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new OcrContractError(`${path} must be between 0 and 1`);
  }
  return value;
};

const readPositiveNumber = (value: unknown, path: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new OcrContractError(`${path} must be a positive number`);
  }
  return value;
};

const readPositiveInteger = (value: unknown, path: string): number => {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new OcrContractError(`${path} must be a positive integer`);
  }
  return value as number;
};

const parseEvidence = (
  value: unknown,
  path: string,
  manifest: OcrRoutingManifest,
  requiredScopeKey?: string,
): OcrEvidenceCandidate => {
  if (!isRecord(value)) {
    throw new OcrContractError(`${path} must be an object`);
  }
  const scopeKey = readNonEmptyString(value.scopeKey, `${path}.scopeKey`);
  if (requiredScopeKey !== undefined && scopeKey !== requiredScopeKey) {
    throw new OcrContractError(`${path}.scopeKey must match its variant scope`);
  }
  const scope = findRoutingScope(manifest, scopeKey);
  if (scope === undefined || scope.kind === "ignore") {
    throw new OcrContractError(`${path}.scopeKey is not an extraction scope`);
  }
  const pageNumber = readPositiveInteger(
    value.pageNumber,
    `${path}.pageNumber`,
  );
  if (!scope.pages.some((page) => page.pageNumber === pageNumber)) {
    throw new OcrContractError(`${path}.pageNumber is not in the named scope`);
  }
  const sourceSnippet =
    value.sourceSnippet === undefined
      ? undefined
      : readNonEmptyString(value.sourceSnippet, `${path}.sourceSnippet`);
  return {
    scopeKey,
    pageNumber,
    ...(sourceSnippet === undefined ? {} : { sourceSnippet }),
  };
};

/**
 * Citations are validated one at a time, and a bad one loses only itself.
 * A model reading a 15-page excerpt has to map each page back to its original
 * brochure number, and it sometimes miscounts one of them; refusing the whole
 * list for that cost a real run all 14 of its correctly-read amenities
 * (2026-09-23, Godrej Altus flipchart) because 1 of 12 citations named a page
 * outside the scope. Evidence stays mandatory — a value whose citations are
 * *all* unusable still fails, because then nothing supports it.
 */
const parseEvidenceList = (
  value: unknown,
  path: string,
  manifest: OcrRoutingManifest,
  requiredScopeKey?: string,
): OcrEvidenceCandidate[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new OcrContractError(`${path} must contain at least one citation`);
  }
  const kept: OcrEvidenceCandidate[] = [];
  for (const [index, item] of value.entries()) {
    try {
      kept.push(
        parseEvidence(item, `${path}[${index}]`, manifest, requiredScopeKey),
      );
    } catch (error) {
      if (!(error instanceof OcrContractError)) throw error;
      console.warn(`[ocr] left out one citation: ${error.message}`);
    }
  }
  if (kept.length === 0) {
    throw new OcrContractError(
      `${path} has no citation inside the named scope`,
    );
  }
  return kept;
};

const validateFieldValue = (
  field: ActiveOcrField,
  value: unknown,
  path: string,
): unknown => {
  const { dataType } = field;
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
  if (dataType === "positive_integer") {
    return readPositiveInteger(value, path);
  }
  if (dataType === "positive_number") {
    // Area fields (`*_sqft`) arrive here already converted from the printed unit.
    return readPositiveNumber(value, path);
  }
  if (dataType === "property_type_key") {
    const key = readNonEmptyString(value, path);
    if (field.allowedValues && !field.allowedValues.includes(key)) {
      throw new OcrContractError(`${path} is not an approved property type`);
    }
    return key;
  }
  if (dataType === "percentage_0_to_100") {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 100
    ) {
      throw new OcrContractError(`${path} must be between 0 and 100`);
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
      throw new OcrContractError(
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
      throw new OcrContractError(`${path} must be an ISO calendar date`);
    }
    return value;
  }
  if (dataType === "amenity_key_array") {
    if (
      !Array.isArray(value) ||
      value.some((item) => typeof item !== "string" || item.trim() === "")
    ) {
      throw new OcrContractError(`${path} must contain amenity keys`);
    }
    const normalized = value.map((item) => (item as string).trim());
    if (new Set(normalized).size !== normalized.length) {
      throw new OcrContractError(`${path} contains duplicate amenity keys`);
    }
    const unknown = normalized.find(
      (key) => field.allowedValues && !field.allowedValues.includes(key),
    );
    if (unknown !== undefined) {
      throw new OcrContractError(
        `${path} contains an unapproved amenity key: ${unknown}`,
      );
    }
    return normalized;
  }
  throw new OcrContractError(`unsupported active OCR data type: ${dataType}`);
};

const parseRoom = (value: unknown, path: string): OcrRoomDimension => {
  if (!isRecord(value)) {
    throw new OcrContractError(`${path} must be an object`);
  }
  const room: OcrRoomDimension = {
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
    throw new OcrContractError(`${path} must contain a supported measurement`);
  }
  return room;
};

/**
 * Reads a list of rooms, keeping each one that can be read. A room with no printed
 * measurement (an open terrace, a splash pool) carries no dimension, so it is left
 * out on its own rather than taking the rest of the list with it.
 */
const readRooms = (rooms: unknown[], listPath: string): OcrRoomDimension[] => {
  const kept: OcrRoomDimension[] = [];
  rooms.forEach((room, index) => {
    try {
      kept.push(parseRoom(room, `${listPath}[${index}]`));
    } catch (error) {
      if (!(error instanceof OcrContractError)) throw error;
      console.warn(`[ocr] left out one room: ${error.message}`);
    }
  });
  return kept;
};

const parseDimensions = (
  dims: unknown,
  dimPath: string,
): NonNullable<OcrUnitVariantDetailsCandidate["dimensions"]> => {
  if (!isRecord(dims)) {
    throw new OcrContractError(`${dimPath} must be an object`);
  }
  const dimensions: NonNullable<OcrUnitVariantDetailsCandidate["dimensions"]> =
    {};
  // A null list means "none", the same as leaving it out.
  if (dims.rooms !== undefined && dims.rooms !== null) {
    if (!Array.isArray(dims.rooms)) {
      throw new OcrContractError(`${dimPath}.rooms must be an array`);
    }
    dimensions.rooms = readRooms(dims.rooms, `${dimPath}.rooms`);
  }
  if (Array.isArray(dims.foyer)) {
    // Several foyers (one per block, say) do not fit a single foyer, but nothing
    // needs to be lost: keep each one as a named room.
    dimensions.rooms = [
      ...(dimensions.rooms ?? []),
      ...dims.foyer.map((foyer, index) =>
        parseRoom(
          isRecord(foyer) && foyer.name === undefined
            ? { ...foyer, name: "Foyer" }
            : foyer,
          `${dimPath}.foyer[${index}]`,
        ),
      ),
    ];
  } else if (dims.foyer !== undefined) {
    dimensions.foyer =
      dims.foyer === null ? null : parseRoom(dims.foyer, `${dimPath}.foyer`);
  }
  if (dims.balconies !== undefined && dims.balconies !== null) {
    if (!Array.isArray(dims.balconies)) {
      throw new OcrContractError(`${dimPath}.balconies must be an array`);
    }
    dimensions.balconies = readRooms(dims.balconies, `${dimPath}.balconies`);
  }
  return dimensions;
};

/**
 * The ONE place a brochure measurement is converted to feet or square feet.
 *
 * The model returns what is printed, never a conversion: numbers or text such as
 * "4.36 m" or "12'-6\"", plus the unit the plan states once for everything on it
 * (`lengthUnit`, `areaUnit`), or null when none is printed. This function reads
 * each one with `readMeasurement`, which converts from the printed unit and
 * refuses a number that has none: a measurement with no unit is left out and
 * logged, never assumed to be feet. It emits our canonical shape (`lengthFt`,
 * `widthFt`, `areaSqft`), which `parseVariantDetails` then validates. Nothing
 * after this converts again, and canonical keys in the model's answer are ignored
 * here, so a value can never be converted twice or trusted without a unit.
 */
const convertProviderDetails = (raw: unknown, path: string): unknown => {
  if (!isRecord(raw)) return raw;
  const out: Record<string, unknown> = { ...raw };

  const measure = (
    value: unknown,
    kind: "length" | "area",
    legend: unknown,
    where: string,
  ): number | undefined => {
    if (value === undefined || value === null) return undefined;
    const result = readMeasurement(value, kind, legend);
    if (result.ok) return result.value;
    console.warn(`[ocr] left out ${where}: ${result.reason}`);
    return undefined;
  };

  /**
   * A plan that prints each room as one string — `12'-7" X 12'-0"` — instead of
   * a separate length and width. Models reach for their own key for this
   * (`dimension`, `size`) rather than splitting it themselves, and a brochure
   * that prints the pair twice in two unit systems makes that near-certain:
   * the 2026-09-23 Godrej Altus flipchart lost all 269 of its rooms this way.
   * Each half still goes through `readMeasurement`, so an unaccompanied number
   * is refused exactly as before — this splits the string, it never assumes a
   * unit for it.
   */
  const splitDimensionPair = (
    value: unknown,
    legendLength: unknown,
    where: string,
  ): { length?: number; width?: number } => {
    if (typeof value !== "string") return {};
    const halves = value.split(/\s*[xX×]\s*/).filter((part) => part.trim());
    if (halves.length !== 2) return {};
    const length = readMeasurement(halves[0], "length", legendLength);
    const width = readMeasurement(halves[1], "length", legendLength);
    if (!length.ok || !width.ok) {
      const reason = !length.ok
        ? length.reason
        : !width.ok
          ? width.reason
          : "unreadable";
      console.warn(`[ocr] left out ${where}: ${reason}`);
      return {};
    }
    return { length: length.value, width: width.value };
  };

  const convertRoom = (room: unknown, where: string): unknown => {
    if (!isRecord(room)) return room;
    const converted: Record<string, unknown> = {};
    if (room.name !== undefined) converted.name = room.name;
    const legendLength = dimensionLegend.length;
    const legendArea = dimensionLegend.area;
    let length = measure(
      room.length,
      "length",
      legendLength,
      `${where}.length`,
    );
    let width = measure(room.width, "length", legendLength, `${where}.width`);
    const area = measure(room.area, "area", legendArea, `${where}.area`);
    if (length === undefined && width === undefined) {
      // Tried in order: a pair printed with its own unit beats one relying on
      // the plan's legend, so `12'-7" X 12'-0"` wins over a bare `4.16 X 3.66`.
      for (const key of ["dimension", "dimensions", "size"] as const) {
        const pair = splitDimensionPair(
          room[key],
          legendLength,
          `${where}.${key}`,
        );
        if (pair.length !== undefined || pair.width !== undefined) {
          length = pair.length;
          width = pair.width;
          break;
        }
      }
    }
    if (length !== undefined) converted.lengthFt = length;
    if (width !== undefined) converted.widthFt = width;
    if (area !== undefined) converted.areaSqft = area;
    return converted;
  };

  const dimensionLegend: { length: unknown; area: unknown } = {
    length: undefined,
    area: undefined,
  };

  if (Array.isArray(raw.areas)) {
    out.areas = raw.areas.flatMap((entry, index) => {
      if (!isRecord(entry)) return [entry];
      const areaSqft = measure(
        entry.area,
        "area",
        entry.unit,
        `${path}.areas[${index}]`,
      );
      return areaSqft === undefined ? [] : [{ basis: entry.basis, areaSqft }];
    });
    // Every area unreadable: say nothing, rather than an empty list.
    if ((out.areas as unknown[]).length === 0) delete out.areas;
  }

  if (isRecord(raw.dimensions)) {
    const dims = raw.dimensions;
    dimensionLegend.length = dims.lengthUnit;
    dimensionLegend.area = dims.areaUnit;
    const convertedDims: Record<string, unknown> = {};
    if (Array.isArray(dims.rooms)) {
      convertedDims.rooms = dims.rooms.map((room, index) =>
        convertRoom(room, `${path}.dimensions.rooms[${index}]`),
      );
    } else if (dims.rooms === null) {
      convertedDims.rooms = null;
    }
    if (Array.isArray(dims.foyer)) {
      convertedDims.foyer = dims.foyer.map((foyer, index) =>
        convertRoom(foyer, `${path}.dimensions.foyer[${index}]`),
      );
    } else if (dims.foyer !== undefined) {
      convertedDims.foyer =
        dims.foyer === null
          ? null
          : convertRoom(dims.foyer, `${path}.dimensions.foyer`);
    }
    if (Array.isArray(dims.balconies)) {
      convertedDims.balconies = dims.balconies.map((room, index) =>
        convertRoom(room, `${path}.dimensions.balconies[${index}]`),
      );
    } else if (dims.balconies === null) {
      convertedDims.balconies = null;
    }
    out.dimensions = convertedDims;
  }
  return out;
};

const parseVariantDetails = (
  value: unknown,
  path: string,
): OcrUnitVariantDetailsCandidate => {
  if (!isRecord(value)) {
    throw new OcrContractError(`${path} must be an object`);
  }
  const result: OcrUnitVariantDetailsCandidate = {};
  const leaveOutIfUnreadable = (detail: string, read: () => void): void => {
    try {
      read();
    } catch (error) {
      if (!(error instanceof OcrContractError)) throw error;
      // Optional detail read off a drawing: leave it out rather than fail the run.
      console.warn(`[ocr] left out ${detail}: ${error.message}`);
    }
  };
  if (value.totalUnitsOfVariant !== undefined) {
    leaveOutIfUnreadable("totalUnitsOfVariant", () => {
      result.totalUnitsOfVariant = readPositiveInteger(
        value.totalUnitsOfVariant,
        `${path}.totalUnitsOfVariant`,
      );
    });
  }
  if (value.unitsPerFloor !== undefined) {
    leaveOutIfUnreadable("unitsPerFloor", () => {
      result.unitsPerFloor = readPositiveInteger(
        value.unitsPerFloor,
        `${path}.unitsPerFloor`,
      );
    });
  }
  if (value.areas !== undefined) {
    leaveOutIfUnreadable("areas", () => {
      if (!Array.isArray(value.areas)) {
        throw new OcrContractError(`${path}.areas must be an array`);
      }
      // A basis printed twice is normally the same area in two unit systems
      // ("142.93 sq. mt." and "1538 sq. ft."), already converted to sq ft
      // above — so the repeat is agreement, not a contradiction, and dropping
      // the whole list for it cost a real run every area it had, carpet
      // included (2026-09-23, Godrej Altus flipchart). Two readings that
      // genuinely disagree are still refused: that needs a person.
      const byBasis = new Map<string, number>();
      value.areas.forEach((area, index) => {
        const areaPath = `${path}.areas[${index}]`;
        if (!isRecord(area)) {
          throw new OcrContractError(`${areaPath} must be an object`);
        }
        if (
          !["carpet", "super_built_up", "built_up"].includes(String(area.basis))
        ) {
          throw new OcrContractError(`${areaPath}.basis is not supported`);
        }
        const basis = area.basis as "carpet" | "super_built_up" | "built_up";
        const areaSqft = readPositiveNumber(
          area.areaSqft,
          `${areaPath}.areaSqft`,
        );
        const seen = byBasis.get(basis);
        if (seen === undefined) {
          byBasis.set(basis, areaSqft);
          return;
        }
        if (Math.abs(seen - areaSqft) / seen > 0.01) {
          throw new OcrContractError(
            `${path}.areas gives two different ${basis} areas (${seen} and ${areaSqft} sq ft)`,
          );
        }
      });
      result.areas = [...byBasis.entries()].map(([basis, areaSqft]) => ({
        basis: basis as "carpet" | "super_built_up" | "built_up",
        areaSqft,
      }));
    });
  }
  if (value.dimensions !== undefined && value.dimensions !== null) {
    try {
      result.dimensions = parseDimensions(
        value.dimensions,
        `${path}.dimensions`,
      );
    } catch (error) {
      if (!(error instanceof OcrContractError)) throw error;
      // Room measurements are optional detail read off a drawing. A malformed one
      // is left out (the admin still sees the floor plan) rather than failing a
      // whole paid run over it.
      console.warn(`[ocr] left out unreadable dimensions: ${error.message}`);
    }
  }
  return result;
};

export const validateNewPipelineExtraction = (
  input: unknown,
  manifest: OcrRoutingManifest,
  activeFields: ActiveOcrField[],
  expectedPipelineVersion: string,
  expectedFieldSchemaVersion: string,
): NewPipelineExtraction => {
  if (!isRecord(input) || input.origin !== "new_pipeline") {
    throw new OcrContractError(
      "only new-pipeline output can enter submission ingestion",
    );
  }
  if (input.pipelineVersion !== expectedPipelineVersion) {
    throw new OcrContractError("pipeline version does not match the OCR job");
  }
  if (input.fieldSchemaVersion !== expectedFieldSchemaVersion) {
    throw new OcrContractError(
      "field schema version does not match the OCR job",
    );
  }
  if (!Array.isArray(input.fields) || !Array.isArray(input.unitVariants)) {
    throw new OcrContractError("fields and unitVariants must be arrays");
  }

  const activeFieldMap = new Map(
    activeFields.map((field) => [field.fieldKey, field]),
  );
  const seenFields = new Set<string>();
  const fields: OcrFieldCandidate[] = input.fields.map((candidate, index) => {
    const path = `fields[${index}]`;
    if (!isRecord(candidate)) {
      throw new OcrContractError(`${path} must be an object`);
    }
    const fieldKey = readNonEmptyString(candidate.fieldKey, `${path}.fieldKey`);
    const contract = activeFieldMap.get(fieldKey);
    if (contract === undefined || fieldKey === "unit_variants") {
      throw new OcrContractError(
        `${path}.fieldKey is not an active scalar contract field`,
      );
    }
    if (seenFields.has(fieldKey)) {
      throw new OcrContractError(`duplicate field candidate: ${fieldKey}`);
    }
    seenFields.add(fieldKey);
    const confidence = readConfidence(
      candidate.confidence,
      `${path}.confidence`,
    );
    return {
      fieldKey,
      value: validateFieldValue(contract, candidate.value, `${path}.value`),
      ...(confidence === undefined ? {} : { confidence }),
      evidence: parseEvidenceList(
        candidate.evidence,
        `${path}.evidence`,
        manifest,
      ),
    };
  });

  if (input.unitVariants.length > 0 && !activeFieldMap.has("unit_variants")) {
    throw new OcrContractError(
      "unit_variants is not active in the field contract",
    );
  }
  const seenUnitVariantScopes = new Set<string>();
  const seenVariantNames = new Set<string>();
  const unitVariants: OcrUnitVariantCandidate[] = input.unitVariants.map(
    (candidate, index) => {
      const path = `unitVariants[${index}]`;
      if (!isRecord(candidate)) {
        throw new OcrContractError(`${path} must be an object`);
      }
      const scopeKey = readNonEmptyString(
        candidate.scopeKey,
        `${path}.scopeKey`,
      );
      const scope = findRoutingScope(manifest, scopeKey);
      if (scope?.kind !== "unit_variant" && scope?.kind !== "floor_plans") {
        throw new OcrContractError(
          `${path}.scopeKey is not a unit-discovery scope`,
        );
      }
      if (
        scope.kind === "unit_variant" &&
        seenUnitVariantScopes.has(scopeKey)
      ) {
        throw new OcrContractError(
          `unit-variant scope ${scopeKey} returned more than one variant`,
        );
      }
      if (scope.kind === "unit_variant") {
        seenUnitVariantScopes.add(scopeKey);
      }
      const variantName =
        scope.kind === "floor_plans"
          ? readNonEmptyString(candidate.variantName, `${path}.variantName`)
          : undefined;
      if (
        scope.kind === "unit_variant" &&
        candidate.variantName !== undefined
      ) {
        throw new OcrContractError(
          `${path}.variantName is only allowed for a floor-plans scope`,
        );
      }
      if (scope.kind === "floor_plans" && variantName === undefined) {
        throw new OcrContractError(
          `${path}.variantName is required for a floor-plans scope`,
        );
      }
      const canonicalVariantName =
        scope.kind === "unit_variant"
          ? scope.variant.variantName
          : readNonEmptyString(candidate.variantName, `${path}.variantName`);
      const normalizedVariantName = canonicalVariantName.toLocaleLowerCase();
      if (seenVariantNames.has(normalizedVariantName)) {
        throw new OcrContractError(
          `duplicate extracted variant name: ${canonicalVariantName}`,
        );
      }
      seenVariantNames.add(normalizedVariantName);
      const confidence = readConfidence(
        candidate.confidence,
        `${path}.confidence`,
      );
      return {
        scopeKey,
        ...(variantName === undefined ? {} : { variantName }),
        details: parseVariantDetails(candidate.details, `${path}.details`),
        ...(confidence === undefined ? {} : { confidence }),
        evidence: parseEvidenceList(
          candidate.evidence,
          `${path}.evidence`,
          manifest,
          scopeKey,
        ),
      };
    },
  );

  return {
    origin: "new_pipeline",
    pipelineVersion: expectedPipelineVersion,
    fieldSchemaVersion: expectedFieldSchemaVersion,
    fields,
    unitVariants,
  };
};

const canonicalVariantValue = (
  scope: OcrUnitVariantScope | OcrRoutingManifest["scopes"][number],
  candidate: OcrUnitVariantCandidate,
) => {
  if (scope.kind === "unit_variant") {
    return {
      variantName: scope.variant.variantName,
      ...(scope.variant.bhkTypeKey === undefined
        ? {}
        : { bhkTypeKey: scope.variant.bhkTypeKey }),
      ...(scope.variant.layoutTypeKey === undefined
        ? {}
        : { layoutTypeKey: scope.variant.layoutTypeKey }),
      ...candidate.details,
    };
  }
  if (scope.kind === "floor_plans" && candidate.variantName !== undefined) {
    return { variantName: candidate.variantName, ...candidate.details };
  }
  throw new OcrContractError(
    `unit variant candidate cannot be assembled for scope ${scope.scopeKey}`,
  );
};

export const buildSubmissionFieldCandidates = (
  input: NewPipelineExtraction,
  manifest: OcrRoutingManifest,
): SubmissionFieldCandidate[] => {
  if (!isRecord(input) || input.origin !== "new_pipeline") {
    throw new OcrContractError(
      "legacy evaluation output cannot become submission input",
    );
  }
  const extraction = input;
  const result: SubmissionFieldCandidate[] = extraction.fields.map((field) => ({
    ...field,
    evidence: deduplicateSubmissionEvidence(
      field.evidence.map((evidence) => ({
        ...evidence,
        valuePath: "$",
      })),
    ),
  }));

  if (extraction.unitVariants.length === 0) {
    return result;
  }
  const candidatesByScope = new Map<string, OcrUnitVariantCandidate[]>();
  for (const candidate of extraction.unitVariants) {
    const current = candidatesByScope.get(candidate.scopeKey) ?? [];
    current.push(candidate);
    candidatesByScope.set(candidate.scopeKey, current);
  }
  const assembledEntries = manifest.scopes.flatMap((scope) => {
    if (scope.kind !== "unit_variant" && scope.kind !== "floor_plans") {
      return [];
    }
    return (candidatesByScope.get(scope.scopeKey) ?? []).map((candidate) => ({
      candidate,
      value: canonicalVariantValue(scope, candidate),
    }));
  });
  const assembled = assembledEntries.map((entry) => entry.value);
  const variantConfidences = extraction.unitVariants.map(
    (candidate) => candidate.confidence,
  );
  const confidence = variantConfidences.every(
    (candidate): candidate is number => candidate !== undefined,
  )
    ? Math.min(...variantConfidences)
    : undefined;
  const evidence = deduplicateSubmissionEvidence(
    assembledEntries.flatMap(({ candidate }, index) =>
      candidate.evidence.map((item) => ({ ...item, valuePath: `$[${index}]` })),
    ),
  );
  result.push({
    fieldKey: "unit_variants",
    value: assembled,
    ...(confidence === undefined ? {} : { confidence }),
    evidence,
  });
  return result;
};

const DEFAULT_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-sonnet-5";
/**
 * Sonnet 5's own ceiling is 128,000 (OpenRouter `max_completion_tokens`); this
 * is headroom, not a budget — an unemitted token costs nothing, so the only
 * thing a low cap buys is a failed run. The previous 32,000 was the direct
 * cause of every `output_length` failure this pipeline has ever had: with
 * reasoning silently uncapped (see `reasoning` in `callModel`), hidden
 * thinking filled all 32,000 before any JSON was written. See DECISIONS.md
 * 2026-09-23 (reasoning-billing entry).
 */
const DEFAULT_MAX_COMPLETION_TOKENS = 64_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 8 * 60 * 1_000;

export type OcrAdapterFailureCode =
  | "configuration_error"
  | "source_load_failed"
  | "provider_error"
  | "request_timeout"
  | "output_length"
  | "invalid_json"
  | "invalid_response";

export class OcrAdapterError extends Error {
  constructor(
    public readonly code: OcrAdapterFailureCode,
    message: string,
    public readonly providerRequestId?: string,
  ) {
    super(message);
    this.name = "OcrAdapterError";
  }
}

const partialUsageByError = new WeakMap<object, OcrScopeUsage[]>();

const rememberPartialUsage = (error: unknown, usage: OcrScopeUsage[]): void => {
  if (typeof error === "object" && error !== null) {
    partialUsageByError.set(error, [...usage]);
  }
};

/**
 * Provider requests already made when an extraction failed part-way (scopes that
 * succeeded, plus the one whose response was unusable). Empty when none were
 * billed. Kept beside the error, not on it, so no error type changes shape.
 */
export const partialUsageOf = (error: unknown): OcrScopeUsage[] =>
  typeof error === "object" && error !== null
    ? (partialUsageByError.get(error) ?? [])
    : [];

export interface OpenRouterOcrAdapterOptions {
  loadSourcePdf: (gcsPath: string) => Promise<Uint8Array>;
  apiKey?: string;
  model?: string;
  endpoint?: string;
  maxCompletionTokens?: number;
  requestTimeoutMs?: number;
  fetch?: typeof fetch;
  retryDelayMs?: number;
  checkpointDirectory?: string | false;
}

interface OpenRouterScopeResponse {
  fields?: unknown;
  unitVariant?: unknown;
  unitVariants?: unknown;
  unmappedRawEvidence?: unknown;
}

interface OpenRouterStreamResult {
  rawText: string;
  finishReason?: string;
  providerRequestId?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    reasoningTokens?: number;
    costUsd?: number;
  };
}

interface OcrScopeCheckpoint {
  scopeKey: string;
  pageNumbers: number[];
  providerRequestId?: string;
  response: unknown;
}

const writeCheckpointAtomically = async (
  checkpointPath: string,
  value: unknown,
): Promise<void> => {
  await mkdir(path.dirname(checkpointPath), { recursive: true });
  const temporaryPath = `${checkpointPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, checkpointPath);
};

const stripCodeFence = (value: string): string =>
  value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

const readConfiguredInteger = (
  value: number | undefined,
  fallback: number,
  name: string,
): number => {
  const configured = value ?? fallback;
  if (!Number.isInteger(configured) || configured <= 0) {
    throw new OcrAdapterError(
      "configuration_error",
      `${name} must be a positive integer`,
    );
  }
  return configured;
};

const fieldsForScope = (
  scope: OcrRoutingManifest["scopes"][number],
  activeFields: ActiveOcrField[],
): ActiveOcrField[] => {
  if (scope.kind === "amenities") {
    return activeFields.filter(
      (field) => field.fieldKey === "property.amenities",
    );
  }
  if (scope.kind === "specifications") {
    return activeFields.filter((field) =>
      field.fieldKey.startsWith("property.specifications."),
    );
  }
  if (scope.kind === "property_details") {
    return activeFields.filter(
      (field) =>
        field.fieldKey !== "unit_variants" &&
        field.fieldKey !== "property.amenities" &&
        !field.fieldKey.startsWith("property.specifications."),
    );
  }
  return [];
};

/**
 * Lost twice already — do not drop this a third time. Fixed once on
 * 2026-09-02 (Kimana Towers "rule 10": mirrored units and repeated
 * floor-range plans transcribed as separate ~30-room variants burned the
 * completion budget and roughly doubled cost) but that fix lived only in a
 * one-off eval script, never the production prompt; the 2026-09-20 and
 * 2026-09-23 rewrites of this prompt both independently reintroduced the
 * bug (2026-09-23's discovery prompt went further and told the model to
 * enumerate mirrored units as separate entries). See DECISIONS.md
 * 2026-09-02 and 2026-09-23.
 */
const MIRRORED_UNIT_MERGE_RULE =
  "Two or more units are the SAME variant, not separate ones, when their layouts are identical or mirrored (a flat and its mirror image, or a floor plate repeated unchanged across a labelled floor range): collapse them into one variant record naming every unit/floor number it covers. Only a layout that differs in at least one room, dimension, or amenity from its neighbor is a distinct variant.";

const createScopePrompt = (
  scope: OcrRoutingManifest["scopes"][number],
  activeFields: ActiveOcrField[],
): string => {
  const sourcePages = scope.pages.map((page) => page.pageNumber);
  const scalarFields = fieldsForScope(scope, activeFields);
  const variantDetails =
    'totalUnitsOfVariant (positive integer), unitsPerFloor (positive integer), areas [{basis: carpet|super_built_up|built_up, area: the number exactly as printed, unit: the unit printed with it or null}], and dimensions {lengthUnit: the unit the plan states for its lengths or null, areaUnit: the unit stated for room areas or null, rooms: [room], foyer: one room object or null (never a list; put extra foyers in rooms), balconies: [room]}; each room has ONLY these keys: name, and any explicitly printed length, width, or area, exactly as printed (a number, or text such as "4.36 m" or "12\'-6\\""). Never invent another key such as "dimension" or "size" for a measurement. When a plan prints one room as a single pair ("12\'-7\\" X 12\'-0\\""), split it: the first value is length, the second is width. When the SAME room is printed twice in two unit systems (feet-inches and metres side by side), return it ONCE, using whichever of the two carries its own printed unit — do not return the room twice and do not merge the two into one string';
  const variantOutput =
    scope.kind === "floor_plans"
      ? `"unitVariants": [{"variantName": string, "details": object, "confidence": number, "evidence": [{"pageNumber": number, "sourceSnippet": string}]}]`
      : `"unitVariant": null | {"details": object, "confidence": number, "evidence": [{"pageNumber": number, "sourceSnippet": string}]}`;
  const variantInstruction =
    scope.kind === "unit_variant"
      ? `Extract exactly one unit variant for \"${scope.variant.variantName}\". Put its values in unitVariant.details using only: ${variantDetails}. Combine all excerpt pages into this one variant; never emit a second variant.`
      : scope.kind === "floor_plans"
        ? `Discover every distinct unit variant explicitly shown across these floor-plan pages. Return one unitVariants entry per distinct variant, merging pages that show levels of the same duplex or penthouse. ${MIRRORED_UNIT_MERGE_RULE} Each variantName must be a concise, evidence-backed name printed in the brochure and, when it covers more than one unit or floor number, must say so (for example "Block B - Units 301 & 302 (3rd Floor)" or "Flat Type 02 - Typical Floor (3rd-20th)"); do not invent BHK or layout catalog keys. Put each variant's values in details using only: ${variantDetails}. Return an empty unitVariants array when these pages do not explicitly show a unit variant.`
        : "This is not a unit-discovery scope. Return unitVariant as null.";

  return `You extract evidence-backed real-estate brochure facts into a reviewed submission. Return one complete JSON object only, with no markdown or commentary.

Output shape:
{
  "fields": [{"fieldKey": string, "value": unknown, "confidence": number, "evidence": [{"pageNumber": number, "sourceSnippet": string}]}],
  ${variantOutput},
  "unmappedRawEvidence": [{"fieldKey": string, "value": unknown, "evidence": [{"pageNumber": number, "sourceSnippet": string}]}]
}

Rules:
- UNITS ARE EXACT. Copy every measurement exactly as printed and NEVER convert, round, or assume a unit. Give the unit exactly as printed: with the number when it is printed there ("4.36 m", "1,250 sq ft"), or once as lengthUnit / areaUnit / unit when the plan states it for everything (a scale note or legend such as "all dimensions in mm"). If no unit is printed anywhere for a measurement, set its unit to null and still copy the number: it will be held for a person to check, not guessed. Never treat a number as feet or square feet unless feet are printed. For any field whose key ends in _sqft, return value exactly as printed plus a unit key (for example {"fieldKey": "property.plot_area_sqft", "value": 1200, "unit": "sq yd", ...}); do not convert it yourself.
- Extract only facts explicitly printed on these pages. Never infer, count, summarize marketing copy, or fabricate missing values.
- Never return a price, currency amount, rate per square foot, or commercial term anywhere, including unmappedRawEvidence.
- The only active scalar fields for this scope are: ${JSON.stringify(scalarFields)}. Use their exact fieldKey and dataType-compatible value. Omit missing fields.
- If a useful non-price fact has no active field key, put it in unmappedRawEvidence instead of inventing a destination or silently dropping it.
- Evidence is mandatory for every returned value. This excerpt maps in order to original brochure pages ${sourcePages.join(", ")}; cite those original one-based page numbers only.
- Preserve evidence snippets verbatim and keep confidence between 0 and 1.
- ${variantInstruction}`;
};

const createScopedPdf = async (
  sourcePdfBytes: Uint8Array,
  pageNumbers: number[],
): Promise<Uint8Array> => {
  const source = await PDFDocument.load(sourcePdfBytes, {
    ignoreEncryption: true,
  });
  const scoped = await PDFDocument.create();
  const copiedPages = await scoped.copyPages(
    source,
    pageNumbers.map((pageNumber) => pageNumber - 1),
  );
  for (const page of copiedPages) scoped.addPage(page);
  return scoped.save();
};

const consumeOpenRouterStream = async (
  response: Response,
): Promise<OpenRouterStreamResult> => {
  if (response.body === null) {
    throw new OcrAdapterError(
      "invalid_response",
      "OpenRouter returned a successful response without a stream body",
    );
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let rawText = "";
  let finishReason: string | undefined;
  let providerRequestId: string | undefined;
  let usage: OpenRouterStreamResult["usage"];

  const consumeFrame = (frame: string): void => {
    const data = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (data === "" || data === "[DONE]") return;
    let event: unknown;
    try {
      event = JSON.parse(data);
    } catch {
      return;
    }
    if (!isRecord(event)) return;
    if (typeof event.id === "string") providerRequestId ??= event.id;
    const eventUsage = event.usage;
    if (isRecord(eventUsage)) {
      const readUsageNumber = (key: string): number | undefined =>
        typeof eventUsage[key] === "number" ? eventUsage[key] : undefined;
      const completionDetails = isRecord(eventUsage.completion_tokens_details)
        ? eventUsage.completion_tokens_details
        : undefined;
      usage = {
        ...(readUsageNumber("prompt_tokens") === undefined
          ? {}
          : { promptTokens: readUsageNumber("prompt_tokens") }),
        ...(readUsageNumber("completion_tokens") === undefined
          ? {}
          : { completionTokens: readUsageNumber("completion_tokens") }),
        ...(completionDetails === undefined ||
        typeof completionDetails.reasoning_tokens !== "number"
          ? {}
          : { reasoningTokens: completionDetails.reasoning_tokens }),
        ...(readUsageNumber("cost") === undefined
          ? {}
          : { costUsd: readUsageNumber("cost") }),
      };
    }
    const choices = event.choices;
    if (!Array.isArray(choices) || !isRecord(choices[0])) return;
    const choice = choices[0];
    if (typeof choice.finish_reason === "string") {
      finishReason = choice.finish_reason;
    }
    if (isRecord(choice.delta) && typeof choice.delta.content === "string") {
      rawText += choice.delta.content;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    pending += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const frames = pending.split(/\r?\n\r?\n/);
    pending = frames.pop() ?? "";
    for (const frame of frames) consumeFrame(frame);
    if (done) break;
  }
  if (pending.trim() !== "") consumeFrame(pending);
  return { rawText, finishReason, providerRequestId, usage };
};

const normalizeProviderEvidence = (
  value: unknown,
  scopeKey: string,
): unknown => {
  if (!Array.isArray(value)) return value;
  return value.map((candidate) =>
    isRecord(candidate) ? { ...candidate, scopeKey } : candidate,
  );
};

const assertNoCommercialData = (value: unknown, path: string = "$"): void => {
  if (typeof value === "string") {
    if (/₹|\bINR\b|\bRs\.?\s*\d|\b(?:lakh|crore)\b/i.test(value)) {
      throw new OcrAdapterError(
        "invalid_response",
        `commercial data is forbidden in OCR output at ${path}`,
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoCommercialData(item, `${path}[${index}]`),
    );
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (
      /(?:^|_)(?:price|pricing|rate|cost|amount|currency)(?:_|$)/i.test(key)
    ) {
      throw new OcrAdapterError(
        "invalid_response",
        `commercial field is forbidden in OCR output at ${path}.${key}`,
      );
    }
    assertNoCommercialData(item, `${path}.${key}`);
  }
};

const parseUnmappedCandidate = (
  value: unknown,
  index: number,
  scopeKey: string,
  manifest: OcrRoutingManifest,
): OcrUnmappedEvidenceCandidate => {
  const path = `unmappedRawEvidence[${index}]`;
  if (!isRecord(value)) {
    throw new OcrAdapterError("invalid_response", `${path} must be an object`);
  }
  const fieldKey = readNonEmptyString(value.fieldKey, `${path}.fieldKey`);
  return {
    fieldKey,
    value: value.value,
    scopeKey,
    evidence: parseEvidenceList(
      normalizeProviderEvidence(value.evidence, scopeKey),
      `${path}.evidence`,
      manifest,
      scopeKey,
    ),
  };
};

const parseScopeResponse = (
  input: unknown,
  scope: OcrRoutingManifest["scopes"][number],
  manifest: OcrRoutingManifest,
  activeFields: ActiveOcrField[],
): {
  fields: OcrFieldCandidate[];
  unitVariants: OcrUnitVariantCandidate[];
  unmapped: OcrUnmappedEvidenceCandidate[];
} => {
  if (!isRecord(input)) {
    throw new OcrAdapterError(
      "invalid_response",
      `scope ${scope.scopeKey} response must be an object`,
    );
  }
  const response = input as OpenRouterScopeResponse;
  if (!Array.isArray(response.fields)) {
    throw new OcrAdapterError("invalid_response", "fields must be an array");
  }
  const activeKeys = new Set(activeFields.map((field) => field.fieldKey));
  const allowedScopeKeys = new Set(
    fieldsForScope(scope, activeFields).map((field) => field.fieldKey),
  );
  const known: OcrFieldCandidate[] = [];
  const unmapped: OcrUnmappedEvidenceCandidate[] = [];

  for (const [index, candidate] of response.fields.entries()) {
    if (!isRecord(candidate)) {
      throw new OcrAdapterError(
        "invalid_response",
        `fields[${index}] must be an object`,
      );
    }
    const fieldKey = readNonEmptyString(
      candidate.fieldKey,
      `fields[${index}].fieldKey`,
    );
    const evidence = normalizeProviderEvidence(
      candidate.evidence,
      scope.scopeKey,
    );
    if (!activeKeys.has(fieldKey)) {
      try {
        unmapped.push(
          parseUnmappedCandidate(
            { ...candidate, evidence },
            unmapped.length,
            scope.scopeKey,
            manifest,
          ),
        );
      } catch (error) {
        if (
          !(error instanceof OcrContractError) &&
          !(error instanceof OcrAdapterError)
        ) {
          throw error;
        }
        // Advisory data (no active field key), not the contract this run is
        // paid to fill: one bad citation loses that one note, never the
        // whole already-paid-for run. Same tolerance `fields` already gets
        // below — unmappedRawEvidence has no reason to be the fatal path.
        console.warn(`[ocr] left out unmapped ${fieldKey}: ${error.message}`);
      }
      continue;
    }
    if (
      !allowedScopeKeys.has(fieldKey) ||
      known.some((earlier) => earlier.fieldKey === fieldKey)
    ) {
      // Out of scope, or given twice: keep the first, leave this one out.
      console.warn(
        `[ocr] left out ${fieldKey} in scope ${scope.scopeKey}: not allowed here or repeated`,
      );
      continue;
    }
    try {
      const contract = activeFields.find(
        (field) => field.fieldKey === fieldKey,
      );
      // A field named for square feet is converted here, once, from the unit the
      // brochure printed beside it. The model does not convert, and a value with
      // no printed unit is left out, never assumed to be square feet.
      let value: unknown = candidate.value;
      if (fieldKey.endsWith("_sqft")) {
        const measured = readMeasurement(
          candidate.value,
          "area",
          candidate.unit,
        );
        if (!measured.ok) {
          console.warn(`[ocr] left out ${fieldKey}: ${measured.reason}`);
          continue;
        }
        value = measured.value;
      }
      const built: OcrFieldCandidate = {
        fieldKey,
        value,
        ...(candidate.confidence === undefined
          ? {}
          : {
              confidence: readConfidence(
                candidate.confidence,
                `fields[${index}].confidence`,
              ),
            }),
        evidence: parseEvidenceList(
          evidence,
          `fields[${index}].evidence`,
          manifest,
          scope.scopeKey,
        ),
      };
      if (contract !== undefined) {
        validateFieldValue(contract, value, `fields[${index}].value`);
      }
      known.push(built);
    } catch (error) {
      if (
        !(error instanceof OcrContractError) &&
        !(error instanceof OcrAdapterError)
      ) {
        throw error;
      }
      // A value that does not fit its field is left out, so the admin sees it as
      // "not stated" and can fill it in, instead of losing the whole paid run.
      console.warn(`[ocr] left out ${fieldKey}: ${error.message}`);
    }
  }

  if (Array.isArray(response.unmappedRawEvidence)) {
    for (const [index, candidate] of response.unmappedRawEvidence.entries()) {
      try {
        unmapped.push(
          parseUnmappedCandidate(candidate, index, scope.scopeKey, manifest),
        );
      } catch (error) {
        if (
          !(error instanceof OcrContractError) &&
          !(error instanceof OcrAdapterError)
        ) {
          throw error;
        }
        console.warn(
          `[ocr] left out unmappedRawEvidence[${index}]: ${error.message}`,
        );
      }
    }
  } else if (response.unmappedRawEvidence !== undefined) {
    throw new OcrAdapterError(
      "invalid_response",
      "unmappedRawEvidence must be an array",
    );
  }

  if (scope.kind !== "unit_variant" && scope.kind !== "floor_plans") {
    if (response.unitVariant !== null && response.unitVariant !== undefined) {
      throw new OcrAdapterError(
        "invalid_response",
        `scope ${scope.scopeKey} must not return a unit variant`,
      );
    }
    if (response.unitVariants !== null && response.unitVariants !== undefined) {
      throw new OcrAdapterError(
        "invalid_response",
        `scope ${scope.scopeKey} must not return unit variants`,
      );
    }
    return { fields: known, unitVariants: [], unmapped };
  }

  if (scope.kind === "floor_plans") {
    if (response.unitVariant !== null && response.unitVariant !== undefined) {
      throw new OcrAdapterError(
        "invalid_response",
        `floor-plans scope ${scope.scopeKey} must use unitVariants`,
      );
    }
    if (!Array.isArray(response.unitVariants)) {
      throw new OcrAdapterError(
        "invalid_response",
        `floor-plans scope ${scope.scopeKey} must return a unitVariants array`,
      );
    }
    const variantNames = new Set<string>();
    const unitVariants = response.unitVariants.map((candidate, index) => {
      const path = `unitVariants[${index}]`;
      if (!isRecord(candidate)) {
        throw new OcrAdapterError(
          "invalid_response",
          `${path} must be an object`,
        );
      }
      if (
        candidate.bhkTypeKey !== undefined ||
        candidate.layoutTypeKey !== undefined
      ) {
        throw new OcrAdapterError(
          "invalid_response",
          `${path} must not assign BHK or layout catalog keys`,
        );
      }
      const variantName = readNonEmptyString(
        candidate.variantName,
        `${path}.variantName`,
      );
      const normalizedVariantName = variantName.toLocaleLowerCase();
      if (variantNames.has(normalizedVariantName)) {
        throw new OcrAdapterError(
          "invalid_response",
          `floor-plans scope ${scope.scopeKey} returned duplicate variant name: ${variantName}`,
        );
      }
      variantNames.add(normalizedVariantName);
      const confidence = readConfidence(
        candidate.confidence,
        `${path}.confidence`,
      );
      return {
        scopeKey: scope.scopeKey,
        variantName,
        // The model's raw reading is converted here, once, and then validated.
        details: parseVariantDetails(
          convertProviderDetails(candidate.details, `${path}.details`),
          `${path}.details`,
        ),
        ...(confidence === undefined ? {} : { confidence }),
        evidence: parseEvidenceList(
          normalizeProviderEvidence(candidate.evidence, scope.scopeKey),
          `${path}.evidence`,
          manifest,
          scope.scopeKey,
        ),
      };
    });
    return { fields: known, unitVariants, unmapped };
  }

  if (response.unitVariants !== null && response.unitVariants !== undefined) {
    throw new OcrAdapterError(
      "invalid_response",
      `unit-variant scope ${scope.scopeKey} must use unitVariant`,
    );
  }
  if (!isRecord(response.unitVariant)) {
    throw new OcrAdapterError(
      "invalid_response",
      `scope ${scope.scopeKey} must return one unit variant`,
    );
  }
  const confidence = readConfidence(
    response.unitVariant.confidence,
    "unitVariant.confidence",
  );
  return {
    fields: known,
    unmapped,
    unitVariants: [
      {
        scopeKey: scope.scopeKey,
        details: parseVariantDetails(
          convertProviderDetails(
            response.unitVariant.details,
            "unitVariant.details",
          ),
          "unitVariant.details",
        ),
        ...(confidence === undefined ? {} : { confidence }),
        evidence: parseEvidenceList(
          normalizeProviderEvidence(
            response.unitVariant.evidence,
            scope.scopeKey,
          ),
          "unitVariant.evidence",
          manifest,
          scope.scopeKey,
        ),
      },
    ],
  };
};

export const createOpenRouterOcrAdapter = (
  options: OpenRouterOcrAdapterOptions,
): OcrProviderAdapter => {
  const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new OcrAdapterError(
      "configuration_error",
      "OPENROUTER_API_KEY is required",
    );
  }
  const model =
    options.model ??
    process.env.OPENROUTER_OCR_MODEL ??
    DEFAULT_OPENROUTER_MODEL;
  const maxCompletionTokens = readConfiguredInteger(
    options.maxCompletionTokens,
    Number(
      process.env.OPENROUTER_OCR_MAX_COMPLETION_TOKENS ??
        DEFAULT_MAX_COMPLETION_TOKENS,
    ),
    "OPENROUTER_OCR_MAX_COMPLETION_TOKENS",
  );
  const requestTimeoutMs = readConfiguredInteger(
    options.requestTimeoutMs,
    Number(
      process.env.OPENROUTER_OCR_REQUEST_TIMEOUT_MS ??
        DEFAULT_REQUEST_TIMEOUT_MS,
    ),
    "OPENROUTER_OCR_REQUEST_TIMEOUT_MS",
  );
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const retryDelayMs = options.retryDelayMs ?? 1_000;
  const configuredCheckpointDirectory =
    options.checkpointDirectory === false
      ? undefined
      : path.resolve(
          options.checkpointDirectory ??
            process.env.OCR_CHECKPOINT_DIR ??
            ".local/ocr-checkpoints",
        );

  /**
   * The one place a PDF and a prompt become an OpenRouter request, so the
   * retry/timeout handling and the native-PDF request shape exist in one
   * place rather than two copies that could drift.
   */
  const callModel = async (
    pdfBytes: Uint8Array,
    filenameHint: string,
    promptText: string,
    maxTokensOverride?: number,
  ): Promise<OpenRouterStreamResult> => {
    const body = JSON.stringify({
      model,
      max_tokens: maxTokensOverride ?? maxCompletionTokens,
      /**
       * `enabled: false`, never `exclude: true`. `exclude` only hides the
       * reasoning from the response — it is still generated and still billed
       * at the output rate. Paired with a `max_tokens` budget (which maps to
       * Anthropic's `budget_tokens`, a parameter **removed on Sonnet 5**, so
       * the cap was silently ignored), that bought unlimited invisible
       * thinking: 55% of this pipeline's entire spend to date, and every
       * `output_length` failure. Extraction is transcription against an
       * explicit contract; it does not need chain-of-thought.
       */
      reasoning: { enabled: false },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "file",
              file: {
                filename: `${filenameHint}.pdf`,
                file_data: `data:application/pdf;base64,${Buffer.from(pdfBytes).toString("base64")}`,
              },
            },
            { type: "text", text: promptText },
          ],
        },
      ],
      plugins: [{ id: "file-parser", pdf: { engine: "native" } }],
      response_format: { type: "json_object" },
      provider: { require_parameters: true },
      stream: true,
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response: Response;
      try {
        response = await fetchImplementation(
          options.endpoint ?? DEFAULT_OPENROUTER_URL,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body,
            signal: AbortSignal.timeout(requestTimeoutMs),
          },
        );
      } catch (error) {
        const isTimeout =
          error instanceof Error &&
          (error.name === "TimeoutError" || error.name === "AbortError");
        if (attempt === 0 && !isTimeout) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
          continue;
        }
        throw new OcrAdapterError(
          isTimeout ? "request_timeout" : "provider_error",
          isTimeout
            ? `OpenRouter request timed out after ${requestTimeoutMs}ms`
            : `OpenRouter request failed: ${String(error)}`,
        );
      }

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 2_000);
        const transient =
          response.status === 408 ||
          response.status === 429 ||
          response.status >= 500;
        if (attempt === 0 && transient) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
          continue;
        }
        throw new OcrAdapterError(
          "provider_error",
          `OpenRouter returned HTTP ${response.status}: ${detail}`,
        );
      }
      return consumeOpenRouterStream(response);
    }
    throw new OcrAdapterError("provider_error", "OpenRouter retry exhausted");
  };

  const callScope = (
    scope: OcrRoutingManifest["scopes"][number],
    pdfBytes: Uint8Array,
    activeFields: ActiveOcrField[],
  ): Promise<OpenRouterStreamResult> =>
    callModel(pdfBytes, scope.scopeKey, createScopePrompt(scope, activeFields));

  return {
    providerKey: `openrouter:${model}`,
    async extract(
      request: OcrExtractionRequest,
    ): Promise<OcrProviderExtractionResult> {
      let sourcePdf: Uint8Array;
      try {
        sourcePdf = await options.loadSourcePdf(request.gcsPath);
      } catch (error) {
        throw new OcrAdapterError(
          "source_load_failed",
          `Unable to load source PDF: ${String(error)}`,
        );
      }

      const fields: OcrFieldCandidate[] = [];
      const unitVariants: OcrUnitVariantCandidate[] = [];
      const unmappedRawEvidence: OcrUnmappedEvidenceCandidate[] = [];
      const providerRequestIds: string[] = [];
      const usage: OcrScopeUsage[] = [];
      const scopeCheckpoints: OcrScopeCheckpoint[] = [];
      const checkpointPath =
        request.jobId === undefined ||
        configuredCheckpointDirectory === undefined
          ? undefined
          : path.join(
              configuredCheckpointDirectory,
              `${request.jobId.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`,
            );

      // Answers a previous attempt of this same job already received.
      const earlierResponses = new Map<string, OcrScopeCheckpoint>();
      if (checkpointPath !== undefined) {
        try {
          const earlier = JSON.parse(
            await readFile(checkpointPath, "utf8"),
          ) as {
            jobId?: unknown;
            providerKey?: unknown;
            scopes?: unknown;
          };
          if (
            earlier.jobId === request.jobId &&
            earlier.providerKey === `openrouter:${model}` &&
            Array.isArray(earlier.scopes)
          ) {
            for (const entry of earlier.scopes as OcrScopeCheckpoint[]) {
              if (
                typeof entry?.scopeKey === "string" &&
                Array.isArray(entry.pageNumbers) &&
                entry.response !== undefined
              ) {
                earlierResponses.set(entry.scopeKey, entry);
              }
            }
          }
        } catch {
          // No earlier checkpoint, or an unreadable one: start fresh.
        }
      }

      const saveCheckpoint = async (
        status: "extracting" | "extracted",
        result?: OcrProviderExtractionResult,
      ): Promise<void> => {
        if (checkpointPath === undefined) return;
        await writeCheckpointAtomically(checkpointPath, {
          version: 1,
          status,
          jobId: request.jobId,
          sourceDocumentId: request.sourceDocumentId,
          providerKey: `openrouter:${model}`,
          updatedAt: new Date().toISOString(),
          scopes: scopeCheckpoints,
          ...(result === undefined ? {} : { result }),
        });
      };

      // `expandedScopes` and `effectiveManifest` share this one array by
      // reference: scopes are appended below in document order, so evidence
      // validation for a scope processed now can always find itself and
      // everything before it. The manifest the adapter runs is the confirmed
      // one, unchanged — persistence resolves a unit variant's scopeKey
      // against this same object (see `ingestion.ts`), which is what keeps a
      // discovered variant from silently vanishing at persistence time.
      const expandedScopes: OcrRoutingManifest["scopes"] = [];
      const effectiveManifest: OcrRoutingManifest = {
        ...request.manifest,
        scopes: expandedScopes,
      };

      try {
        for (const scope of request.manifest.scopes) {
          expandedScopes.push(scope);
          if (scope.kind === "ignore") continue;
          const pageNumbers = scope.pages.map((page) => page.pageNumber);
          const earlier = earlierResponses.get(scope.scopeKey);
          if (
            earlier !== undefined &&
            earlier.pageNumbers.length === pageNumbers.length &&
            earlier.pageNumbers.every((n, i) => n === pageNumbers[i])
          ) {
            // Already answered (and paid for) by an earlier attempt of this job.
            try {
              const reused = parseScopeResponse(
                earlier.response,
                scope,
                effectiveManifest,
                request.activeFields,
              );
              scopeCheckpoints.push(earlier);
              if (earlier.providerRequestId) {
                providerRequestIds.push(earlier.providerRequestId);
              }
              fields.push(...reused.fields);
              unitVariants.push(...reused.unitVariants);
              unmappedRawEvidence.push(...reused.unmapped);
              continue;
            } catch {
              // That answer is unusable; ask again for this scope only.
            }
          }
          const scopedPdf = await createScopedPdf(
            sourcePdf,
            scope.pages.map((page) => page.pageNumber),
          );
          const stream = await callScope(
            scope,
            scopedPdf,
            request.activeFields,
          );
          if (stream.providerRequestId) {
            providerRequestIds.push(stream.providerRequestId);
          }
          usage.push({
            scopeKey: scope.scopeKey,
            inputPdfBytes: scopedPdf.byteLength,
            ...(stream.providerRequestId === undefined
              ? {}
              : { providerRequestId: stream.providerRequestId }),
            ...stream.usage,
          });
          if (stream.finishReason === "length") {
            throw new OcrAdapterError(
              "output_length",
              `OpenRouter exhausted the output budget for scope ${scope.scopeKey}; human re-routing is required`,
              stream.providerRequestId,
            );
          }
          if (stream.finishReason !== "stop") {
            throw new OcrAdapterError(
              "invalid_response",
              `OpenRouter ended scope ${scope.scopeKey} with finish_reason=${stream.finishReason ?? "unknown"}`,
              stream.providerRequestId,
            );
          }
          let parsed: unknown;
          try {
            parsed = JSON.parse(stripCodeFence(stream.rawText));
          } catch {
            throw new OcrAdapterError(
              "invalid_json",
              `OpenRouter returned invalid JSON for scope ${scope.scopeKey}`,
              stream.providerRequestId,
            );
          }
          assertNoCommercialData(parsed);
          // Saved before it is validated: if the answer does not fit the contract,
          // what was paid for is still on disk to inspect.
          scopeCheckpoints.push({
            scopeKey: scope.scopeKey,
            pageNumbers,
            ...(stream.providerRequestId === undefined
              ? {}
              : { providerRequestId: stream.providerRequestId }),
            response: parsed,
          });
          await saveCheckpoint("extracting");
          const scopeResult = parseScopeResponse(
            parsed,
            scope,
            effectiveManifest,
            request.activeFields,
          );
          fields.push(...scopeResult.fields);
          unitVariants.push(...scopeResult.unitVariants);
          unmappedRawEvidence.push(...scopeResult.unmapped);
        }
      } catch (error) {
        // Requests that were billed before this failure still belong in the usage ledger.
        rememberPartialUsage(error, usage);
        throw error;
      }

      let extraction: NewPipelineExtraction;
      try {
        extraction = validateNewPipelineExtraction(
          {
            origin: "new_pipeline",
            pipelineVersion: request.pipelineVersion,
            fieldSchemaVersion: request.fieldSchemaVersion,
            fields,
            unitVariants,
          },
          effectiveManifest,
          request.activeFields,
          request.pipelineVersion,
          request.fieldSchemaVersion,
        );
      } catch (error) {
        // Every scope was paid for by now; record that spend even though this failed.
        rememberPartialUsage(error, usage);
        throw error;
      }

      const result: OcrProviderExtractionResult = {
        extraction,
        unmappedRawEvidence,
        providerRequestIds,
        usage,
        effectiveManifest,
        ...(checkpointPath === undefined ? {} : { checkpointPath }),
      };
      await saveCheckpoint("extracted", result);
      return result;
    },
  };
};
