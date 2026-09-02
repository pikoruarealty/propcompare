import { describe, expect, it } from "vitest";
import {
  buildSubmissionFieldCandidates,
  validateNewPipelineExtraction,
  type ActiveOcrField,
  type NewPipelineExtraction,
} from "./adapter";
import {
  compareLegacyWithNewPipeline,
  createLegacyEvaluationSnapshot,
} from "./legacy-comparison";
import { OcrContractError, parseOcrRoutingManifest } from "./routing";

const activeFields: ActiveOcrField[] = [
  { fieldKey: "property.name", dataType: "string" },
  { fieldKey: "property.amenities", dataType: "amenity_key_array" },
  { fieldKey: "unit_variants", dataType: "unit_variant_array" },
];

interface MutableRoutingInput {
  version: string;
  pageCount: number;
  scopes: Array<{
    scopeKey: string;
    kind: string;
    label: string;
    pages: Array<{ pageNumber: number; label?: string }>;
    variant?: {
      variantName: string;
      bhkTypeKey?: string;
      layoutTypeKey?: string;
    };
  }>;
}

const routingInput: MutableRoutingInput = {
  version: "v1",
  pageCount: 5,
  scopes: [
    {
      scopeKey: "project",
      kind: "property_details",
      label: "Project details",
      pages: [{ pageNumber: 1 }],
    },
    {
      scopeKey: "penthouse",
      kind: "unit_variant",
      label: "5 BHK penthouse",
      variant: {
        variantName: "5 BHK Penthouse",
        bhkTypeKey: "5bhk_plus",
        layoutTypeKey: "penthouse",
      },
      pages: [
        { pageNumber: 2, label: "Lower floor" },
        { pageNumber: 3, label: "Upper floor" },
      ],
    },
    {
      scopeKey: "amenities",
      kind: "amenities",
      label: "Amenities",
      pages: [{ pageNumber: 4 }],
    },
    {
      scopeKey: "ignored",
      kind: "ignore",
      label: "Not relevant",
      pages: [{ pageNumber: 5 }],
    },
  ],
};

const extractionInput = {
  origin: "new_pipeline",
  pipelineVersion: "ocr-v1",
  fieldSchemaVersion: "v1",
  fields: [
    {
      fieldKey: "property.name",
      value: "Example Residences",
      confidence: 0.98,
      evidence: [{ scopeKey: "project", pageNumber: 1 }],
    },
  ],
  unitVariants: [
    {
      scopeKey: "penthouse",
      details: {
        areas: [{ basis: "carpet", areaSqft: 4200 }],
        dimensions: {
          rooms: [{ name: "Living room", lengthFt: 24, widthFt: 18 }],
        },
      },
      confidence: 0.91,
      evidence: [
        { scopeKey: "penthouse", pageNumber: 2 },
        { scopeKey: "penthouse", pageNumber: 3 },
      ],
    },
  ],
};

describe("the versioned OCR routing contract", () => {
  it("keeps multiple penthouse floor-plan pages in one canonical variant", () => {
    const manifest = parseOcrRoutingManifest(routingInput, 5);
    const extraction = validateNewPipelineExtraction(
      extractionInput,
      manifest,
      activeFields,
      "ocr-v1",
      "v1",
    );
    const submissionFields = buildSubmissionFieldCandidates(
      extraction,
      manifest,
    );
    const variants = submissionFields.find(
      (field) => field.fieldKey === "unit_variants",
    );

    expect(variants?.value).toEqual([
      {
        variantName: "5 BHK Penthouse",
        bhkTypeKey: "5bhk_plus",
        layoutTypeKey: "penthouse",
        areas: [{ basis: "carpet", areaSqft: 4200 }],
        dimensions: {
          rooms: [{ name: "Living room", lengthFt: 24, widthFt: 18 }],
        },
      },
    ]);
    expect(variants?.evidence).toEqual([
      { scopeKey: "penthouse", pageNumber: 2, valuePath: "$[0]" },
      { scopeKey: "penthouse", pageNumber: 3, valuePath: "$[0]" },
    ]);
  });

  it("rejects duplicate and out-of-range routing pages", () => {
    const duplicatePage = structuredClone(routingInput);
    duplicatePage.scopes[1].pages.push({ pageNumber: 2 });
    expect(() => parseOcrRoutingManifest(duplicatePage)).toThrow(
      "contains a duplicate page",
    );

    const outOfRangePage = structuredClone(routingInput);
    outOfRangePage.scopes[3].pages[0].pageNumber = 6;
    expect(() => parseOcrRoutingManifest(outOfRangePage)).toThrow(
      "must not exceed the document page count",
    );
  });

  it("does not allow one page to create two unit variants", () => {
    const ambiguous = structuredClone(routingInput);
    ambiguous.scopes.push({
      scopeKey: "penthouse-copy",
      kind: "unit_variant",
      label: "Incorrect second penthouse",
      variant: { variantName: "Penthouse Type B" },
      pages: [{ pageNumber: 3 }],
    });
    expect(() => parseOcrRoutingManifest(ambiguous)).toThrow(
      "cannot belong to two unit-variant scopes",
    );
  });

  it("rejects fields outside the active property contract", () => {
    const manifest = parseOcrRoutingManifest(routingInput);
    const unapprovedField = structuredClone(extractionInput);
    unapprovedField.fields[0].fieldKey = "property.marketing_claim";

    expect(() =>
      validateNewPipelineExtraction(
        unapprovedField,
        manifest,
        activeFields,
        "ocr-v1",
        "v1",
      ),
    ).toThrow("is not an active scalar contract field");
  });

  it("keeps legacy JSON in comparison-only output", () => {
    const manifest = parseOcrRoutingManifest(routingInput);
    const extraction = validateNewPipelineExtraction(
      extractionInput,
      manifest,
      activeFields,
      "ocr-v1",
      "v1",
    );
    const submissionFields = buildSubmissionFieldCandidates(
      extraction,
      manifest,
    );
    const legacy = createLegacyEvaluationSnapshot({
      "property.name": "Old OCR Name",
    });

    expect(
      compareLegacyWithNewPipeline(legacy, submissionFields),
    ).toContainEqual({
      fieldKey: "property.name",
      legacyValue: "Old OCR Name",
      newValue: "Example Residences",
      status: "different",
    });
    expect(() =>
      buildSubmissionFieldCandidates(
        legacy as unknown as NewPipelineExtraction,
        manifest,
      ),
    ).toThrow(OcrContractError);
  });
});
