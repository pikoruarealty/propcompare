import type { SingleFacilityPage } from "./single-facility";

const V1_ROUTING_SCOPE_KINDS = [
  "property_details",
  "amenities",
  "specifications",
  "unit_variant",
  "ignore",
] as const;

const V2_ROUTING_SCOPE_KINDS = [
  ...V1_ROUTING_SCOPE_KINDS,
  "floor_plans",
] as const;

export type OcrRoutingManifestVersion = "v1" | "v2";
export type OcrRoutingScopeKind = (typeof V2_ROUTING_SCOPE_KINDS)[number];

export interface OcrRoutedPage {
  pageNumber: number;
  label?: string;
}

interface OcrRoutingScopeBase {
  scopeKey: string;
  kind: OcrRoutingScopeKind;
  label: string;
  pages: OcrRoutedPage[];
}

export interface OcrUnitVariantScope extends OcrRoutingScopeBase {
  kind: "unit_variant";
  variant: {
    variantName: string;
    bhkTypeKey?: string;
    layoutTypeKey?: string;
  };
}

/**
 * A single ordered collection of confirmed floor-plan pages. Unlike the v1
 * `unit_variant` scope, it deliberately carries no proposed unit identity:
 * Claude discovers and cites the variants after seeing the whole set.
 */
export interface OcrFloorPlansScope extends OcrRoutingScopeBase {
  kind: "floor_plans";
}

export interface OcrNonVariantScope extends OcrRoutingScopeBase {
  kind: Exclude<OcrRoutingScopeKind, "unit_variant" | "floor_plans">;
}

export type OcrRoutingScope =
  OcrUnitVariantScope | OcrFloorPlansScope | OcrNonVariantScope;

export interface OcrRoutingManifest {
  version: OcrRoutingManifestVersion;
  pageCount: number;
  scopes: OcrRoutingScope[];
  /**
   * Single-facility amenity pages whose caption matched the catalog exactly
   * (`src/lib/ocr/single-facility.ts`). Each such page sits in the ignored scope,
   * so no paid read touches it, and becomes an unconfirmed amenity suggestion
   * when the extraction is saved.
   */
  singleFacilities?: SingleFacilityPage[];
}

export class OcrContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OcrContractError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readNonEmptyString = (value: unknown, path: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new OcrContractError(`${path} must be a non-empty string`);
  }

  return value.trim();
};

const readOptionalString = (
  value: unknown,
  path: string,
): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return readNonEmptyString(value, path);
};

const readPositiveInteger = (value: unknown, path: string): number => {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new OcrContractError(`${path} must be a positive integer`);
  }

  return value as number;
};

const parsePage = (
  value: unknown,
  path: string,
  pageCount: number,
): OcrRoutedPage => {
  if (!isRecord(value)) {
    throw new OcrContractError(`${path} must be an object`);
  }

  const pageNumber = readPositiveInteger(
    value.pageNumber,
    `${path}.pageNumber`,
  );
  if (pageNumber > pageCount) {
    throw new OcrContractError(
      `${path}.pageNumber must not exceed the document page count`,
    );
  }

  const label = readOptionalString(value.label, `${path}.label`);
  return label === undefined ? { pageNumber } : { pageNumber, label };
};

const parseScope = (
  value: unknown,
  path: string,
  pageCount: number,
  version: OcrRoutingManifestVersion,
): OcrRoutingScope => {
  if (!isRecord(value)) {
    throw new OcrContractError(`${path} must be an object`);
  }

  const scopeKey = readNonEmptyString(value.scopeKey, `${path}.scopeKey`);
  const label = readNonEmptyString(value.label, `${path}.label`);
  if (
    typeof value.kind !== "string" ||
    !(
      version === "v1" ? V1_ROUTING_SCOPE_KINDS : V2_ROUTING_SCOPE_KINDS
    ).includes(value.kind as never)
  ) {
    throw new OcrContractError(`${path}.kind is not supported`);
  }
  const kind = value.kind as OcrRoutingScopeKind;

  if (!Array.isArray(value.pages) || value.pages.length === 0) {
    throw new OcrContractError(`${path}.pages must contain at least one page`);
  }

  const pages = value.pages.map((page, index) =>
    parsePage(page, `${path}.pages[${index}]`, pageCount),
  );
  const uniquePages = new Set(pages.map((page) => page.pageNumber));
  if (uniquePages.size !== pages.length) {
    throw new OcrContractError(`${path}.pages contains a duplicate page`);
  }

  if (kind === "floor_plans") {
    if (value.variant !== undefined) {
      throw new OcrContractError(
        `${path}.variant is not allowed on a floor-plans scope`,
      );
    }
    for (let index = 1; index < pages.length; index += 1) {
      if (pages[index - 1].pageNumber >= pages[index].pageNumber) {
        throw new OcrContractError(
          `${path}.pages must be in ascending document order`,
        );
      }
    }
    return { scopeKey, kind, label, pages };
  }

  if (kind !== "unit_variant") {
    return { scopeKey, kind, label, pages };
  }

  if (!isRecord(value.variant)) {
    throw new OcrContractError(`${path}.variant must be an object`);
  }

  const variantName = readNonEmptyString(
    value.variant.variantName,
    `${path}.variant.variantName`,
  );
  const bhkTypeKey = readOptionalString(
    value.variant.bhkTypeKey,
    `${path}.variant.bhkTypeKey`,
  );
  const layoutTypeKey = readOptionalString(
    value.variant.layoutTypeKey,
    `${path}.variant.layoutTypeKey`,
  );

  return {
    scopeKey,
    kind: "unit_variant",
    label,
    pages,
    variant: {
      variantName,
      ...(bhkTypeKey === undefined ? {} : { bhkTypeKey }),
      ...(layoutTypeKey === undefined ? {} : { layoutTypeKey }),
    },
  };
};

const parseSingleFacilities = (
  value: unknown,
  pageCount: number,
  ignoredPages: ReadonlySet<number>,
): SingleFacilityPage[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new OcrContractError("singleFacilities must be an array");
  }
  const seen = new Set<number>();
  return value.map((entry, index) => {
    const path = `singleFacilities[${index}]`;
    if (!isRecord(entry))
      throw new OcrContractError(`${path} must be an object`);
    const pageNumber = readPositiveInteger(
      entry.pageNumber,
      `${path}.pageNumber`,
    );
    if (pageNumber > pageCount) {
      throw new OcrContractError(
        `${path}.pageNumber must not exceed the document page count`,
      );
    }
    if (seen.has(pageNumber)) {
      throw new OcrContractError(`${path} repeats page ${pageNumber}`);
    }
    seen.add(pageNumber);
    // A page that is offered as a suggestion is not read by extraction.
    if (!ignoredPages.has(pageNumber)) {
      throw new OcrContractError(
        `${path}: page ${pageNumber} must be in the ignored scope, not extracted`,
      );
    }
    return {
      pageNumber,
      caption: readNonEmptyString(entry.caption, `${path}.caption`),
      amenityKey: readNonEmptyString(entry.amenityKey, `${path}.amenityKey`),
      amenityLabel: readNonEmptyString(
        entry.amenityLabel,
        `${path}.amenityLabel`,
      ),
    };
  });
};

export const parseOcrRoutingManifest = (
  input: unknown,
  expectedPageCount?: number,
): OcrRoutingManifest => {
  if (!isRecord(input) || (input.version !== "v1" && input.version !== "v2")) {
    throw new OcrContractError("routing manifest version must be v1 or v2");
  }
  const version = input.version;

  const pageCount = readPositiveInteger(input.pageCount, "pageCount");
  if (expectedPageCount !== undefined && pageCount !== expectedPageCount) {
    throw new OcrContractError(
      "routing manifest pageCount does not match the source document",
    );
  }
  if (!Array.isArray(input.scopes) || input.scopes.length === 0) {
    throw new OcrContractError("scopes must contain at least one scope");
  }

  const scopes = input.scopes.map((scope, index) =>
    parseScope(scope, `scopes[${index}]`, pageCount, version),
  );
  const scopeKeys = new Set<string>();
  const routedPages = new Set<number>();
  const ignoredPages = new Set<number>();
  const unitDiscoveryPages = new Set<number>();
  const unitVariantNames = new Set<string>();
  let floorPlansScopeCount = 0;
  let extractionScopeCount = 0;

  for (const scope of scopes) {
    if (scopeKeys.has(scope.scopeKey)) {
      throw new OcrContractError(`duplicate scope key: ${scope.scopeKey}`);
    }
    scopeKeys.add(scope.scopeKey);

    if (scope.kind !== "ignore") {
      extractionScopeCount += 1;
    }
    if (scope.kind === "unit_variant") {
      const normalizedVariantName =
        scope.variant.variantName.toLocaleLowerCase();
      if (unitVariantNames.has(normalizedVariantName)) {
        throw new OcrContractError(
          `duplicate proposed variant name: ${scope.variant.variantName}`,
        );
      }
      unitVariantNames.add(normalizedVariantName);
    }
    if (scope.kind === "floor_plans") {
      floorPlansScopeCount += 1;
      if (floorPlansScopeCount > 1) {
        throw new OcrContractError(
          "routing manifest may contain only one floor-plans scope",
        );
      }
    }

    for (const page of scope.pages) {
      if (scope.kind === "ignore") {
        if (routedPages.has(page.pageNumber)) {
          throw new OcrContractError(
            `page ${page.pageNumber} cannot be ignored and extracted`,
          );
        }
        ignoredPages.add(page.pageNumber);
        continue;
      }

      if (ignoredPages.has(page.pageNumber)) {
        throw new OcrContractError(
          `page ${page.pageNumber} cannot be ignored and extracted`,
        );
      }
      routedPages.add(page.pageNumber);

      if (scope.kind === "unit_variant" || scope.kind === "floor_plans") {
        if (unitDiscoveryPages.has(page.pageNumber)) {
          throw new OcrContractError(
            `page ${page.pageNumber} cannot belong to two unit-discovery scopes`,
          );
        }
        unitDiscoveryPages.add(page.pageNumber);
      }
    }
  }

  if (extractionScopeCount === 0) {
    throw new OcrContractError(
      "routing manifest must contain at least one extraction scope",
    );
  }

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    if (!routedPages.has(pageNumber) && !ignoredPages.has(pageNumber)) {
      throw new OcrContractError(
        `page ${pageNumber} must be routed or explicitly ignored`,
      );
    }
  }

  const singleFacilities = parseSingleFacilities(
    input.singleFacilities,
    pageCount,
    ignoredPages,
  );
  return singleFacilities.length === 0
    ? { version, pageCount, scopes }
    : { version, pageCount, scopes, singleFacilities };
};

export const findRoutingScope = (
  manifest: OcrRoutingManifest,
  scopeKey: string,
): OcrRoutingScope | undefined =>
  manifest.scopes.find((scope) => scope.scopeKey === scopeKey);
