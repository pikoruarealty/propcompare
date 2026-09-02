const ROUTING_SCOPE_KINDS = [
  "property_details",
  "amenities",
  "specifications",
  "unit_variant",
  "ignore",
] as const;

export type OcrRoutingScopeKind = (typeof ROUTING_SCOPE_KINDS)[number];

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

export interface OcrNonVariantScope extends OcrRoutingScopeBase {
  kind: Exclude<OcrRoutingScopeKind, "unit_variant">;
}

export type OcrRoutingScope = OcrUnitVariantScope | OcrNonVariantScope;

export interface OcrRoutingManifest {
  version: "v1";
  pageCount: number;
  scopes: OcrRoutingScope[];
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
): OcrRoutingScope => {
  if (!isRecord(value)) {
    throw new OcrContractError(`${path} must be an object`);
  }

  const scopeKey = readNonEmptyString(value.scopeKey, `${path}.scopeKey`);
  const label = readNonEmptyString(value.label, `${path}.label`);
  if (
    typeof value.kind !== "string" ||
    !ROUTING_SCOPE_KINDS.includes(value.kind as OcrRoutingScopeKind)
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

export const parseOcrRoutingManifest = (
  input: unknown,
  expectedPageCount?: number,
): OcrRoutingManifest => {
  if (!isRecord(input) || input.version !== "v1") {
    throw new OcrContractError("routing manifest version must be v1");
  }

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
    parseScope(scope, `scopes[${index}]`, pageCount),
  );
  const scopeKeys = new Set<string>();
  const routedPages = new Set<number>();
  const ignoredPages = new Set<number>();
  const unitVariantPages = new Set<number>();
  const unitVariantNames = new Set<string>();
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

      if (scope.kind === "unit_variant") {
        if (unitVariantPages.has(page.pageNumber)) {
          throw new OcrContractError(
            `page ${page.pageNumber} cannot belong to two unit-variant scopes`,
          );
        }
        unitVariantPages.add(page.pageNumber);
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

  return { version: "v1", pageCount, scopes };
};

export const findRoutingScope = (
  manifest: OcrRoutingManifest,
  scopeKey: string,
): OcrRoutingScope | undefined =>
  manifest.scopes.find((scope) => scope.scopeKey === scopeKey);
