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
  if (value.unitsPerFloor !== undefined) {
    result.unitsPerFloor = readPositiveInteger(
      value.unitsPerFloor,
      `${path}.unitsPerFloor`,
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

const DEFAULT_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-sonnet-5";
const DEFAULT_MAX_COMPLETION_TOKENS = 32_000;
const DEFAULT_MAX_REASONING_TOKENS = 2_048;
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

export interface OpenRouterOcrAdapterOptions {
  loadSourcePdf: (gcsPath: string) => Promise<Uint8Array>;
  apiKey?: string;
  model?: string;
  endpoint?: string;
  maxCompletionTokens?: number;
  maxReasoningTokens?: number;
  requestTimeoutMs?: number;
  fetch?: typeof fetch;
  retryDelayMs?: number;
}

interface OpenRouterScopeResponse {
  fields?: unknown;
  unitVariant?: unknown;
  unmappedRawEvidence?: unknown;
}

interface OpenRouterStreamResult {
  rawText: string;
  finishReason?: string;
  providerRequestId?: string;
}

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

const createScopePrompt = (
  scope: OcrRoutingManifest["scopes"][number],
  activeFields: ActiveOcrField[],
): string => {
  const sourcePages = scope.pages.map((page) => page.pageNumber);
  const scalarFields = fieldsForScope(scope, activeFields);
  const variantInstruction =
    scope.kind === "unit_variant"
      ? `Extract exactly one unit variant for \"${scope.variant.variantName}\". Put its values in unitVariant.details using only: totalUnitsOfVariant (positive integer), unitsPerFloor (positive integer), areas [{basis: carpet|super_built_up|built_up, areaSqft: positive number}], and dimensions {rooms, foyer, balconies}; each room has name and any explicitly printed lengthFt, widthFt, or areaSqft. Combine all excerpt pages into this one variant; never emit a second variant.`
      : "This is not a unit-variant scope. Return unitVariant as null.";

  return `You extract evidence-backed real-estate brochure facts into a reviewed submission. Return one complete JSON object only, with no markdown or commentary.

Output shape:
{
  "fields": [{"fieldKey": string, "value": unknown, "confidence": number, "evidence": [{"pageNumber": number, "sourceSnippet": string}]}],
  "unitVariant": null | {"details": object, "confidence": number, "evidence": [{"pageNumber": number, "sourceSnippet": string}]},
  "unmappedRawEvidence": [{"fieldKey": string, "value": unknown, "evidence": [{"pageNumber": number, "sourceSnippet": string}]}]
}

Rules:
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
  return { rawText, finishReason, providerRequestId };
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
  unitVariant?: OcrUnitVariantCandidate;
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
      unmapped.push(
        parseUnmappedCandidate(
          { ...candidate, evidence },
          unmapped.length,
          scope.scopeKey,
          manifest,
        ),
      );
      continue;
    }
    if (!allowedScopeKeys.has(fieldKey)) {
      throw new OcrAdapterError(
        "invalid_response",
        `${fieldKey} is not allowed in scope ${scope.scopeKey}`,
      );
    }
    known.push({
      fieldKey,
      value: candidate.value,
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
    });
  }

  if (Array.isArray(response.unmappedRawEvidence)) {
    for (const candidate of response.unmappedRawEvidence) {
      unmapped.push(
        parseUnmappedCandidate(
          candidate,
          unmapped.length,
          scope.scopeKey,
          manifest,
        ),
      );
    }
  } else if (response.unmappedRawEvidence !== undefined) {
    throw new OcrAdapterError(
      "invalid_response",
      "unmappedRawEvidence must be an array",
    );
  }

  if (scope.kind !== "unit_variant") {
    if (response.unitVariant !== null && response.unitVariant !== undefined) {
      throw new OcrAdapterError(
        "invalid_response",
        `scope ${scope.scopeKey} must not return a unit variant`,
      );
    }
    return { fields: known, unmapped };
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
    unitVariant: {
      scopeKey: scope.scopeKey,
      details: parseVariantDetails(
        response.unitVariant.details,
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
  const maxReasoningTokens = readConfiguredInteger(
    options.maxReasoningTokens,
    Number(
      process.env.OPENROUTER_OCR_MAX_REASONING_TOKENS ??
        DEFAULT_MAX_REASONING_TOKENS,
    ),
    "OPENROUTER_OCR_MAX_REASONING_TOKENS",
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

  const callScope = async (
    scope: OcrRoutingManifest["scopes"][number],
    pdfBytes: Uint8Array,
    activeFields: ActiveOcrField[],
  ): Promise<OpenRouterStreamResult> => {
    const body = JSON.stringify({
      model,
      max_tokens: maxCompletionTokens,
      reasoning: { max_tokens: maxReasoningTokens, exclude: true },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "file",
              file: {
                filename: `${scope.scopeKey}.pdf`,
                file_data: `data:application/pdf;base64,${Buffer.from(pdfBytes).toString("base64")}`,
              },
            },
            { type: "text", text: createScopePrompt(scope, activeFields) },
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

      for (const scope of request.manifest.scopes) {
        if (scope.kind === "ignore") continue;
        const scopedPdf = await createScopedPdf(
          sourcePdf,
          scope.pages.map((page) => page.pageNumber),
        );
        const stream = await callScope(scope, scopedPdf, request.activeFields);
        if (stream.providerRequestId) {
          providerRequestIds.push(stream.providerRequestId);
        }
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
        const scopeResult = parseScopeResponse(
          parsed,
          scope,
          request.manifest,
          request.activeFields,
        );
        fields.push(...scopeResult.fields);
        if (scopeResult.unitVariant) unitVariants.push(scopeResult.unitVariant);
        unmappedRawEvidence.push(...scopeResult.unmapped);
      }

      const extraction = validateNewPipelineExtraction(
        {
          origin: "new_pipeline",
          pipelineVersion: request.pipelineVersion,
          fieldSchemaVersion: request.fieldSchemaVersion,
          fields,
          unitVariants,
        },
        request.manifest,
        request.activeFields,
        request.pipelineVersion,
        request.fieldSchemaVersion,
      );
      return { extraction, unmappedRawEvidence, providerRequestIds };
    },
  };
};
