import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  buildSubmissionFieldCandidates,
  createOpenRouterOcrAdapter,
  OcrAdapterError,
  validateNewPipelineExtraction,
  type ActiveOcrField,
  type NewPipelineExtraction,
} from "./adapter";
import {
  compareLegacyWithNewPipeline,
  createLegacyEvaluationSnapshot,
} from "./legacy-comparison";
import { OcrContractError, parseOcrRoutingManifest } from "./routing";

const createSyntheticPdf = async (): Promise<Uint8Array> => {
  const pdf = await PDFDocument.create();
  for (let page = 0; page < 5; page += 1) pdf.addPage([200, 200]);
  return pdf.save();
};

const streamResponse = (
  content: string,
  finishReason: string = "stop",
  id: string = "generation-test",
): Response =>
  new Response(
    `data: ${JSON.stringify({ id, choices: [{ delta: { content }, finish_reason: finishReason }] })}\n\ndata: [DONE]\n\n`,
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );

const validScopePayload = (scopeKey: string): unknown => {
  if (scopeKey === "project") {
    return {
      fields: [
        {
          fieldKey: "property.name",
          value: "Synthetic Residences",
          confidence: 0.99,
          evidence: [{ pageNumber: 1, sourceSnippet: "Synthetic Residences" }],
        },
      ],
      unitVariant: null,
      unmappedRawEvidence: [],
    };
  }
  if (scopeKey === "penthouse") {
    return {
      fields: [],
      unitVariant: {
        details: { unitsPerFloor: 2 },
        confidence: 0.92,
        evidence: [
          { pageNumber: 2, sourceSnippet: "Lower floor" },
          { pageNumber: 3, sourceSnippet: "Upper floor" },
        ],
      },
      unmappedRawEvidence: [],
    };
  }
  return {
    fields: [
      {
        fieldKey: "property.amenities",
        value: ["gym"],
        confidence: 0.9,
        evidence: [{ pageNumber: 4, sourceSnippet: "Gym" }],
      },
    ],
    unitVariant: null,
    unmappedRawEvidence: [],
  };
};

const scopeKeyFromRequest = (init?: RequestInit): string => {
  const body = JSON.parse(String(init?.body)) as {
    messages: Array<{
      content: Array<{ file?: { filename?: string } }>;
    }>;
  };
  return (
    body.messages[0].content[0].file?.filename?.replace(/\.pdf$/, "") ?? ""
  );
};

const activeFields: ActiveOcrField[] = [
  { fieldKey: "property.name", dataType: "string" },
  {
    fieldKey: "property.amenities",
    dataType: "amenity_key_array",
    allowedValues: ["gym", "swimming_pool"],
  },
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

  it("merges duplicate evidence snippets for the same DB evidence key", () => {
    const manifest = parseOcrRoutingManifest(routingInput, 5);
    const duplicateEvidence = structuredClone(
      extractionInput,
    ) as NewPipelineExtraction;
    duplicateEvidence.fields[0].evidence = [
      {
        scopeKey: "project",
        pageNumber: 1,
        sourceSnippet: "Example",
      },
      {
        scopeKey: "project",
        pageNumber: 1,
        sourceSnippet: "Residences",
      },
    ];
    const extraction = validateNewPipelineExtraction(
      duplicateEvidence,
      manifest,
      activeFields,
      "ocr-v1",
      "v1",
    );

    const [propertyName] = buildSubmissionFieldCandidates(extraction, manifest);

    expect(propertyName.evidence).toEqual([
      {
        scopeKey: "project",
        pageNumber: 1,
        sourceSnippet: "Example\nResidences",
        valuePath: "$",
      },
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

describe("the OpenRouter OCR provider adapter", () => {
  const createRequest = async () => ({
    sourceDocumentId: "source-document-test",
    gcsPath: "synthetic/redacted-brochure.pdf",
    manifest: parseOcrRoutingManifest(routingInput),
    pipelineVersion: "ocr-v1",
    fieldSchemaVersion: "v1",
    activeFields,
  });

  it("maps valid per-scope responses into the provider-neutral contract", async () => {
    const requestBodies: string[] = [];
    const fetchMock = (async (_input: unknown, init?: RequestInit) => {
      requestBodies.push(String(init?.body));
      const scopeKey = scopeKeyFromRequest(init);
      return streamResponse(
        JSON.stringify(validScopePayload(scopeKey)),
        "stop",
        `generation-${scopeKey}`,
      );
    }) as typeof fetch;
    const pdf = await createSyntheticPdf();
    const adapter = createOpenRouterOcrAdapter({
      apiKey: "test-key",
      loadSourcePdf: async () => pdf,
      fetch: fetchMock,
      retryDelayMs: 0,
    });

    const result = await adapter.extract(await createRequest());

    expect(result.extraction.fields).toHaveLength(2);
    expect(result.extraction.unitVariants).toEqual([
      {
        scopeKey: "penthouse",
        details: { unitsPerFloor: 2 },
        confidence: 0.92,
        evidence: [
          {
            scopeKey: "penthouse",
            pageNumber: 2,
            sourceSnippet: "Lower floor",
          },
          {
            scopeKey: "penthouse",
            pageNumber: 3,
            sourceSnippet: "Upper floor",
          },
        ],
      },
    ]);
    expect(result.providerRequestIds).toEqual([
      "generation-project",
      "generation-penthouse",
      "generation-amenities",
    ]);
    expect(requestBodies).toHaveLength(3);
    for (const requestBody of requestBodies) {
      const body = JSON.parse(requestBody) as {
        plugins: Array<{ id: string; pdf: { engine: string } }>;
      };
      expect(body.plugins).toEqual([
        { id: "file-parser", pdf: { engine: "native" } },
      ]);
    }
  });

  it("checkpoints each parsed scope before later provider work completes", async () => {
    const checkpointDirectory = await mkdtemp(
      path.join(tmpdir(), "propcompare-ocr-checkpoint-"),
    );
    try {
      const pdf = await createSyntheticPdf();
      let requestCount = 0;
      const fetchMock = (async (_input: unknown, init?: RequestInit) => {
        requestCount += 1;
        if (requestCount === 2) {
          return new Response("synthetic provider failure", { status: 400 });
        }
        const scopeKey = scopeKeyFromRequest(init);
        return streamResponse(
          JSON.stringify(validScopePayload(scopeKey)),
          "stop",
          `generation-${scopeKey}`,
        );
      }) as typeof fetch;
      const adapter = createOpenRouterOcrAdapter({
        apiKey: "test-key",
        loadSourcePdf: async () => pdf,
        fetch: fetchMock,
        retryDelayMs: 0,
        checkpointDirectory,
      });

      await expect(
        adapter.extract({ ...(await createRequest()), jobId: "job-test" }),
      ).rejects.toMatchObject({ code: "provider_error" });

      const checkpoint = JSON.parse(
        await readFile(path.join(checkpointDirectory, "job-test.json"), "utf8"),
      ) as {
        status: string;
        scopes: Array<{ scopeKey: string; response: unknown }>;
      };
      expect(checkpoint.status).toBe("extracting");
      expect(checkpoint.scopes).toHaveLength(1);
      expect(checkpoint.scopes[0]).toMatchObject({
        scopeKey: "project",
        response: validScopePayload("project"),
      });
    } finally {
      await rm(checkpointDirectory, { recursive: true, force: true });
    }
  });

  it("flags unknown fields as unmapped raw evidence", async () => {
    const pdf = await createSyntheticPdf();
    const fetchMock = (async (_input: unknown, init?: RequestInit) => {
      const scopeKey = scopeKeyFromRequest(init);
      const payload = validScopePayload(scopeKey) as {
        fields: Array<Record<string, unknown>>;
      };
      if (scopeKey === "project") {
        payload.fields.push({
          fieldKey: "property.marketing_claim",
          value: "Unapproved claim",
          confidence: 0.8,
          evidence: [{ pageNumber: 1, sourceSnippet: "Unapproved claim" }],
        });
      }
      return streamResponse(JSON.stringify(payload));
    }) as typeof fetch;
    const adapter = createOpenRouterOcrAdapter({
      apiKey: "test-key",
      loadSourcePdf: async () => pdf,
      fetch: fetchMock,
      retryDelayMs: 0,
    });

    const result = await adapter.extract(await createRequest());

    expect(
      result.extraction.fields.some(
        (field) => field.fieldKey === "property.marketing_claim",
      ),
    ).toBe(false);
    expect(result.unmappedRawEvidence).toContainEqual({
      fieldKey: "property.marketing_claim",
      value: "Unapproved claim",
      scopeKey: "project",
      evidence: [
        {
          scopeKey: "project",
          pageNumber: 1,
          sourceSnippet: "Unapproved claim",
        },
      ],
    });
  });

  it("rejects commercial values even when returned as unmapped evidence", async () => {
    const pdf = await createSyntheticPdf();
    const fetchMock = (async (_input: unknown, init?: RequestInit) => {
      const scopeKey = scopeKeyFromRequest(init);
      const payload = validScopePayload(scopeKey) as {
        unmappedRawEvidence: Array<Record<string, unknown>>;
      };
      if (scopeKey === "project") {
        payload.unmappedRawEvidence.push({
          fieldKey: "property.base_price",
          value: "INR 5 crore",
          evidence: [{ pageNumber: 1, sourceSnippet: "INR 5 crore" }],
        });
      }
      return streamResponse(JSON.stringify(payload));
    }) as typeof fetch;
    const adapter = createOpenRouterOcrAdapter({
      apiKey: "test-key",
      loadSourcePdf: async () => pdf,
      fetch: fetchMock,
    });

    await expect(adapter.extract(await createRequest())).rejects.toMatchObject({
      code: "invalid_response",
    } satisfies Partial<OcrAdapterError>);
  });

  it("surfaces malformed JSON with a stable failure code", async () => {
    const pdf = await createSyntheticPdf();
    const adapter = createOpenRouterOcrAdapter({
      apiKey: "test-key",
      loadSourcePdf: async () => pdf,
      fetch: (async () => streamResponse("{not-json")) as typeof fetch,
    });

    await expect(adapter.extract(await createRequest())).rejects.toMatchObject({
      code: "invalid_json",
    } satisfies Partial<OcrAdapterError>);
  });

  it("fails a length-truncated scope for human re-routing", async () => {
    const pdf = await createSyntheticPdf();
    const adapter = createOpenRouterOcrAdapter({
      apiKey: "test-key",
      loadSourcePdf: async () => pdf,
      fetch: (async () =>
        streamResponse('{"fields": [', "length")) as typeof fetch,
    });

    await expect(adapter.extract(await createRequest())).rejects.toMatchObject({
      code: "output_length",
    } satisfies Partial<OcrAdapterError>);
  });
});
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
