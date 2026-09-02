import {
  findRoutingScope,
  OcrContractError,
  type OcrRoutingManifest,
  type OcrUnitVariantScope,
} from "./routing";

export interface ActiveOcrField {
  fieldKey: string;
  dataType: string;
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

export interface OcrExtractionRequest {
  sourceDocumentId: string;
  gcsPath: string;
  manifest: OcrRoutingManifest;
  pipelineVersion: string;
  fieldSchemaVersion: string;
  activeFields: ActiveOcrField[];
}

export interface OcrProviderAdapter {
  readonly providerKey: string;
  extract(request: OcrExtractionRequest): Promise<unknown>;
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

const parseEvidenceList = (
  value: unknown,
  path: string,
  manifest: OcrRoutingManifest,
  requiredScopeKey?: string,
): OcrEvidenceCandidate[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new OcrContractError(`${path} must contain at least one citation`);
  }
  return value.map((item, index) =>
    parseEvidence(item, `${path}[${index}]`, manifest, requiredScopeKey),
  );
};

const validateFieldValue = (
  dataType: string,
  value: unknown,
  path: string,
): unknown => {
  const stringTypes = new Set([
    "string",
    "city_name",
    "locality_name",
    "rera_registration_number",
    "specification_text",
    "property_type_key",
  ]);
  if (stringTypes.has(dataType)) {
    return readNonEmptyString(value, path);
  }
  if (dataType === "positive_integer") {
    return readPositiveInteger(value, path);
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

const parseVariantDetails = (
  value: unknown,
  path: string,
): OcrUnitVariantDetailsCandidate => {
  if (!isRecord(value)) {
    throw new OcrContractError(`${path} must be an object`);
  }
  const result: OcrUnitVariantDetailsCandidate = {};
  if (value.totalUnitsOfVariant !== undefined) {
    result.totalUnitsOfVariant = readPositiveInteger(
      value.totalUnitsOfVariant,
      `${path}.totalUnitsOfVariant`,
    );
  }
  if (value.areas !== undefined) {
    if (!Array.isArray(value.areas)) {
      throw new OcrContractError(`${path}.areas must be an array`);
    }
    const bases = new Set<string>();
    result.areas = value.areas.map((area, index) => {
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
      if (bases.has(basis)) {
        throw new OcrContractError(`${path}.areas contains duplicate bases`);
      }
      bases.add(basis);
      return {
        basis,
        areaSqft: readPositiveNumber(area.areaSqft, `${areaPath}.areaSqft`),
      };
    });
  }
  if (value.dimensions !== undefined) {
    if (!isRecord(value.dimensions)) {
      throw new OcrContractError(`${path}.dimensions must be an object`);
    }
    const dimensions: NonNullable<
      OcrUnitVariantDetailsCandidate["dimensions"]
    > = {};
    if (value.dimensions.rooms !== undefined) {
      if (!Array.isArray(value.dimensions.rooms)) {
        throw new OcrContractError(`${path}.dimensions.rooms must be an array`);
      }
      dimensions.rooms = value.dimensions.rooms.map((room, index) =>
        parseRoom(room, `${path}.dimensions.rooms[${index}]`),
      );
    }
    if (value.dimensions.foyer !== undefined) {
      dimensions.foyer =
        value.dimensions.foyer === null
          ? null
          : parseRoom(value.dimensions.foyer, `${path}.dimensions.foyer`);
    }
    if (value.dimensions.balconies !== undefined) {
      if (!Array.isArray(value.dimensions.balconies)) {
        throw new OcrContractError(
          `${path}.dimensions.balconies must be an array`,
        );
      }
      dimensions.balconies = value.dimensions.balconies.map((room, index) =>
        parseRoom(room, `${path}.dimensions.balconies[${index}]`),
      );
    }
    result.dimensions = dimensions;
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
      value: validateFieldValue(
        contract.dataType,
        candidate.value,
        `${path}.value`,
      ),
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
  const seenVariantScopes = new Set<string>();
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
      if (scope?.kind !== "unit_variant") {
        throw new OcrContractError(
          `${path}.scopeKey is not a unit-variant scope`,
        );
      }
      if (seenVariantScopes.has(scopeKey)) {
        throw new OcrContractError(
          `unit-variant scope ${scopeKey} returned more than one variant`,
        );
      }
      seenVariantScopes.add(scopeKey);
      const confidence = readConfidence(
        candidate.confidence,
        `${path}.confidence`,
      );
      return {
        scopeKey,
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
  scope: OcrUnitVariantScope,
  candidate: OcrUnitVariantCandidate,
) => ({
  variantName: scope.variant.variantName,
  ...(scope.variant.bhkTypeKey === undefined
    ? {}
    : { bhkTypeKey: scope.variant.bhkTypeKey }),
  ...(scope.variant.layoutTypeKey === undefined
    ? {}
    : { layoutTypeKey: scope.variant.layoutTypeKey }),
  ...candidate.details,
});

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
    evidence: field.evidence.map((evidence) => ({
      ...evidence,
      valuePath: "$",
    })),
  }));

  if (extraction.unitVariants.length === 0) {
    return result;
  }
  const orderedScopes = manifest.scopes.filter(
    (scope): scope is OcrUnitVariantScope => scope.kind === "unit_variant",
  );
  const candidatesByScope = new Map(
    extraction.unitVariants.map((candidate) => [candidate.scopeKey, candidate]),
  );
  const assembled = orderedScopes.flatMap((scope) => {
    const candidate = candidatesByScope.get(scope.scopeKey);
    return candidate === undefined
      ? []
      : [canonicalVariantValue(scope, candidate)];
  });
  const variantConfidences = extraction.unitVariants.map(
    (candidate) => candidate.confidence,
  );
  const confidence = variantConfidences.every(
    (candidate): candidate is number => candidate !== undefined,
  )
    ? Math.min(...variantConfidences)
    : undefined;
  const evidence = orderedScopes.flatMap((scope) => {
    const candidate = candidatesByScope.get(scope.scopeKey);
    if (candidate === undefined) {
      return [];
    }
    const valuePath = `$[${assembled.findIndex((value) => value.variantName === scope.variant.variantName)}]`;
    return candidate.evidence.map((item) => ({ ...item, valuePath }));
  });
  result.push({
    fieldKey: "unit_variants",
    value: assembled,
    ...(confidence === undefined ? {} : { confidence }),
    evidence,
  });
  return result;
};
