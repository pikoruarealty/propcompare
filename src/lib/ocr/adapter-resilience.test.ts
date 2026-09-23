import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOpenRouterOcrAdapter,
  partialUsageOf,
  validateNewPipelineExtraction,
  type ActiveOcrField,
} from "./adapter";
import { parseOcrRoutingManifest } from "./routing";

/**
 * A paid answer must never be wasted. These pin the behaviour the first real
 * brochure run showed was missing: the raw answer is kept before it is checked,
 * an answer that is more or messier than expected still yields what we need, and
 * retrying the same job never pays twice for a scope that already answered.
 */

const activeFields: ActiveOcrField[] = [
  { fieldKey: "property.name", dataType: "string" },
  { fieldKey: "property.total_units", dataType: "positive_integer" },
  { fieldKey: "property.city", dataType: "string" },
  { fieldKey: "property.plot_area_sqft", dataType: "positive_number" },
  { fieldKey: "unit_variants", dataType: "unit_variant_array" },
];

const manifest = parseOcrRoutingManifest({
  version: "v2",
  pageCount: 5,
  scopes: [
    {
      scopeKey: "project-details",
      kind: "property_details",
      label: "Project details",
      pages: [{ pageNumber: 1 }],
    },
    {
      scopeKey: "floor-plans",
      kind: "floor_plans",
      label: "Floor plans",
      pages: [{ pageNumber: 2 }, { pageNumber: 3 }],
    },
    {
      scopeKey: "ignored",
      kind: "ignore",
      label: "Ignored",
      pages: [{ pageNumber: 4 }, { pageNumber: 5 }],
    },
  ],
});

const request = (jobId = "job-resilience") => ({
  jobId,
  sourceDocumentId: "doc",
  gcsPath: "synthetic.pdf",
  manifest,
  pipelineVersion: "ocr-v1",
  fieldSchemaVersion: "v1",
  activeFields,
});

const stream = (content: unknown, id: string): Response =>
  new Response(
    `data: ${JSON.stringify({ id, choices: [{ delta: { content: JSON.stringify(content) }, finish_reason: "stop" }] })}\n\n` +
      `data: ${JSON.stringify({ id, choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.5 } })}\n\ndata: [DONE]\n\n`,
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );

const scopeOf = (init?: RequestInit): string => {
  const body = JSON.parse(String(init?.body)) as {
    messages: { content: { file?: { filename?: string } }[] }[];
  };
  return (
    body.messages[0].content[0].file?.filename?.replace(/\.pdf$/, "") ?? ""
  );
};

const project = (overrides: Record<string, unknown> = {}) => ({
  fields: [
    {
      fieldKey: "property.name",
      value: "Kimana Towers",
      confidence: 0.97,
      evidence: [{ pageNumber: 1, sourceSnippet: "Kimana Towers" }],
    },
  ],
  unitVariant: null,
  unmappedRawEvidence: [],
  ...overrides,
});

const floorPlans = (details: unknown) => ({
  fields: [],
  unitVariants: [
    {
      variantName: "Type A",
      details,
      confidence: 0.9,
      evidence: [{ pageNumber: 2, sourceSnippet: "Type A" }],
    },
  ],
  unmappedRawEvidence: [],
});

let directory: string;
let pdf: Uint8Array;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "propcompare-resilience-"));
  const doc = await PDFDocument.create();
  for (let page = 0; page < 5; page += 1) doc.addPage([200, 200]);
  pdf = await doc.save();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});

const adapterFor = (answers: Record<string, unknown>, calls: string[] = []) =>
  createOpenRouterOcrAdapter({
    apiKey: "test",
    loadSourcePdf: async () => pdf,
    checkpointDirectory: directory,
    retryDelayMs: 0,
    fetch: (async (_url: unknown, init?: RequestInit) => {
      const scope = scopeOf(init);
      calls.push(scope);
      return stream(answers[scope], `gen-${scope}-${calls.length}`);
    }) as typeof fetch,
  });

const checkpoint = async (jobId = "job-resilience") =>
  JSON.parse(await readFile(path.join(directory, `${jobId}.json`), "utf8")) as {
    status: string;
    scopes: { scopeKey: string; response: unknown }[];
  };

describe("more than expected, or messier than expected", () => {
  it("keeps several foyers as named rooms instead of failing the run", async () => {
    const adapter = adapterFor({
      "project-details": project(),
      "floor-plans": floorPlans({
        unitsPerFloor: 4,
        dimensions: {
          lengthUnit: "ft",
          rooms: [{ name: "Living", length: 15, width: 12 }],
          foyer: [
            { name: "Block A foyer", length: 12.32, width: 2.11 },
            { length: 16.74, width: 2.21 },
          ],
        },
      }),
    });

    const result = await adapter.extract(request());
    const [variant] = result.extraction.unitVariants;

    expect(variant.details.dimensions?.rooms?.map((room) => room.name)).toEqual(
      ["Living", "Block A foyer", "Foyer"],
    );
    expect(variant.details.dimensions?.foyer).toBeUndefined();
    expect(variant.details.unitsPerFloor).toBe(4);
  });

  it("reads a null list of rooms or balconies as none, keeping the rest of the dimensions", async () => {
    const adapter = adapterFor({
      "project-details": project(),
      "floor-plans": floorPlans({
        dimensions: {
          lengthUnit: "ft",
          rooms: [{ name: "Living", length: 15, width: 12 }],
          balconies: null,
          foyer: null,
        },
      }),
    });

    const [variant] = (await adapter.extract(request())).extraction
      .unitVariants;

    expect(variant.details.dimensions).toEqual({
      rooms: [{ name: "Living", lengthFt: 15, widthFt: 12 }],
      foyer: null,
    });
  });

  it("leaves out only a room with no measurement, keeping the other rooms", async () => {
    const adapter = adapterFor({
      "project-details": project(),
      "floor-plans": floorPlans({
        dimensions: {
          lengthUnit: "ft",
          areaUnit: "sq ft",
          rooms: [
            { name: "Living", length: 15, width: 12 },
            { name: "OPEN TERRACE" },
            { name: "Bedroom", area: 120 },
          ],
          balconies: [{ name: "Balcony" }],
          foyer: { name: "FOYER", length: 3.96, width: 2.11 },
        },
      }),
    });

    const [variant] = (await adapter.extract(request())).extraction
      .unitVariants;

    expect(variant.details.dimensions?.rooms?.map((room) => room.name)).toEqual(
      ["Living", "Bedroom"],
    );
    expect(variant.details.dimensions?.balconies).toEqual([]);
    expect(variant.details.dimensions?.foyer).toMatchObject({ name: "FOYER" });
  });

  it("takes the readable parts of a variant and leaves out the rest", async () => {
    const adapter = adapterFor({
      "project-details": project(),
      "floor-plans": floorPlans({
        unitsPerFloor: "four",
        areas: [{ basis: "carpet", area: "about 1,200", unit: "sq ft" }],
        dimensions: null,
        totalUnitsOfVariant: 24,
        somethingExtra: { anything: true },
      }),
    });

    const result = await adapter.extract(request());
    const [variant] = result.extraction.unitVariants;

    expect(variant.variantName).toBe("Type A");
    expect(variant.details).toEqual({ totalUnitsOfVariant: 24 });
  });

  it("leaves out a field whose value does not fit, and keeps the others", async () => {
    const adapter = adapterFor({
      "project-details": project({
        fields: [
          {
            fieldKey: "property.name",
            value: "Kimana Towers",
            confidence: 0.97,
            evidence: [{ pageNumber: 1, sourceSnippet: "Kimana Towers" }],
          },
          {
            fieldKey: "property.total_units",
            value: "two hundred",
            confidence: 0.6,
            evidence: [{ pageNumber: 1, sourceSnippet: "200 units" }],
          },
          {
            fieldKey: "property.city",
            value: "Ahmedabad",
            confidence: 0.9,
            evidence: [{ pageNumber: 1, sourceSnippet: "Ahmedabad" }],
          },
          {
            fieldKey: "property.city",
            value: "Duplicate city",
            evidence: [{ pageNumber: 1, sourceSnippet: "again" }],
          },
          {
            fieldKey: "unit_variants",
            value: [],
            evidence: [{ pageNumber: 1, sourceSnippet: "wrong scope" }],
          },
        ],
        somethingTheModelAddedOnItsOwn: "kept raw, not used",
      }),
      "floor-plans": floorPlans({}),
    });

    const result = await adapter.extract(request());

    expect(
      result.extraction.fields.map((field) => [field.fieldKey, field.value]),
    ).toEqual([
      ["property.name", "Kimana Towers"],
      ["property.city", "Ahmedabad"],
    ]);
    // Everything the model said is still on disk, extras included.
    const saved = await checkpoint();
    expect(JSON.stringify(saved.scopes[0].response)).toContain(
      "somethingTheModelAddedOnItsOwn",
    );
  });
});

describe("a paid answer is never lost", () => {
  it("saves the raw answer before checking it, so even a rejected one is on disk", async () => {
    const adapter = adapterFor({
      "project-details": project(),
      // Not an object at all: the whole scope answer is unusable.
      "floor-plans": {
        fields: [],
        unitVariants: "none",
        unmappedRawEvidence: [],
      },
    });

    const error = await adapter.extract(request()).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "invalid_response" });

    const saved = await checkpoint();
    expect(saved.scopes.map((scope) => scope.scopeKey)).toEqual([
      "project-details",
      "floor-plans",
    ]);
    expect(saved.scopes[1].response).toEqual({
      fields: [],
      unitVariants: "none",
      unmappedRawEvidence: [],
    });
    // ...and what was billed is still reported for the ledger.
    expect(partialUsageOf(error).map((usage) => usage.scopeKey)).toEqual([
      "project-details",
      "floor-plans",
    ]);
  });

  it("never writes commercial data to the saved answer", async () => {
    const adapter = adapterFor({
      "project-details": project({
        fields: [
          {
            fieldKey: "property.name",
            value: "Kimana Towers",
            price: 12500000,
            evidence: [{ pageNumber: 1, sourceSnippet: "Kimana Towers" }],
          },
        ],
      }),
      "floor-plans": floorPlans({}),
    });

    await expect(adapter.extract(request())).rejects.toBeDefined();
    await expect(checkpoint()).rejects.toBeDefined();
  });

  it("does not pay again for scopes that already answered when the job is retried", async () => {
    const answers = {
      "project-details": project(),
      "floor-plans": { fields: [], unitVariants: "none" },
    };
    const first: string[] = [];
    await adapterFor(answers, first)
      .extract(request())
      .catch(() => undefined);
    expect(first).toEqual(["project-details", "floor-plans"]);

    // The scope that failed is asked again; the one that worked is not.
    const second: string[] = [];
    const result = await adapterFor(
      { ...answers, "floor-plans": floorPlans({ unitsPerFloor: 2 }) },
      second,
    ).extract(request());

    expect(second).toEqual(["floor-plans"]);
    expect(result.extraction.fields.map((field) => field.fieldKey)).toEqual([
      "property.name",
    ]);
    expect(result.extraction.unitVariants).toHaveLength(1);
    // Only the request actually made this time is billed.
    expect(result.usage?.map((usage) => usage.scopeKey)).toEqual([
      "floor-plans",
    ]);
  });

  it("re-reads a saved answer for free, so a parser fix needs no new provider call", async () => {
    const answers = {
      "project-details": project(),
      "floor-plans": floorPlans({ unitsPerFloor: 3 }),
    };
    await adapterFor(answers).extract(request());

    const calls: string[] = [];
    const again = await adapterFor({}, calls).extract(request());

    expect(calls).toEqual([]);
    expect(again.extraction.unitVariants[0].details.unitsPerFloor).toBe(3);
    expect(again.usage).toEqual([]);
  });

  it("does not reuse answers saved for different pages", async () => {
    await adapterFor({
      "project-details": project(),
      "floor-plans": floorPlans({}),
    }).extract(request());

    const moved = parseOcrRoutingManifest({
      version: "v2",
      pageCount: 5,
      scopes: [
        {
          scopeKey: "project-details",
          kind: "property_details",
          label: "Project details",
          pages: [{ pageNumber: 1 }, { pageNumber: 4 }],
        },
        {
          scopeKey: "ignored",
          kind: "ignore",
          label: "Ignored",
          pages: [{ pageNumber: 2 }, { pageNumber: 3 }, { pageNumber: 5 }],
        },
      ],
    });
    const calls: string[] = [];
    await adapterFor({ "project-details": project() }, calls).extract({
      ...request(),
      manifest: moved,
    });

    expect(calls).toEqual(["project-details"]);
  });
});

describe("units: converted once, from what is printed, never assumed", () => {
  const dims = (over: Record<string, unknown>) =>
    floorPlans({ dimensions: over });

  // Each call is a separate job: the same job id would replay the saved answer.
  let job = 0;
  const variantOf = async (answers: Record<string, unknown>) =>
    (await adapterFor(answers).extract(request(`job-units-${(job += 1)}`)))
      .extraction.unitVariants[0];

  it("converts metres printed with the numbers to feet (Kimana's floor plans)", async () => {
    const variant = await variantOf({
      "project-details": project(),
      "floor-plans": dims({
        rooms: [
          { name: "BED ROOM", length: "4.36 m", width: "7 m" },
          { name: "TOILET", length: "2.75 m", width: "2.91 m" },
        ],
      }),
    });

    expect(variant.details.dimensions?.rooms).toEqual([
      { name: "BED ROOM", lengthFt: 14.3, widthFt: 22.97 },
      { name: "TOILET", lengthFt: 9.02, widthFt: 9.55 },
    ]);
  });

  it("converts bare numbers using the unit the plan states once", async () => {
    const variant = await variantOf({
      "project-details": project(),
      "floor-plans": dims({
        lengthUnit: "mm",
        rooms: [{ name: "Living", length: 4360, width: 7000 }],
        balconies: [{ name: "Balcony", length: "3.05 m", width: "1.5 m" }],
      }),
    });

    expect(variant.details.dimensions?.rooms).toEqual([
      { name: "Living", lengthFt: 14.3, widthFt: 22.97 },
    ]);
    // A unit printed with the number wins over the plan's general unit.
    expect(variant.details.dimensions?.balconies).toEqual([
      { name: "Balcony", lengthFt: 10.01, widthFt: 4.92 },
    ]);
  });

  it("reads feet and inches", async () => {
    const variant = await variantOf({
      "project-details": project(),
      "floor-plans": dims({
        rooms: [{ name: "Living", length: `12'-6"`, width: "10 ft 3 in" }],
      }),
    });

    expect(variant.details.dimensions?.rooms).toEqual([
      { name: "Living", lengthFt: 12.5, widthFt: 10.25 },
    ]);
  });

  it("converts room and unit areas to square feet, whatever the unit", async () => {
    const variant = await variantOf({
      "project-details": project(),
      "floor-plans": floorPlans({
        areas: [
          { basis: "carpet", area: 100, unit: "sq m" },
          { basis: "super_built_up", area: "1,700 sq ft" },
        ],
        dimensions: { areaUnit: "sqm", rooms: [{ name: "Study", area: 12 }] },
      }),
    });

    expect(variant.details.areas).toEqual([
      { basis: "carpet", areaSqft: 1076.39 },
      { basis: "super_built_up", areaSqft: 1700 },
    ]);
    expect(variant.details.dimensions?.rooms).toEqual([
      { name: "Study", areaSqft: 129.17 },
    ]);
  });

  it("does NOT store a number with no printed unit, and keeps everything else", async () => {
    const variant = await variantOf({
      "project-details": project(),
      "floor-plans": floorPlans({
        totalUnitsOfVariant: 24,
        areas: [{ basis: "carpet", area: 875, unit: null }],
        dimensions: {
          lengthUnit: null,
          rooms: [
            { name: "Living", length: 4.36, width: 7 },
            { name: "Study", length: "3 m", width: "3 m" },
          ],
        },
      }),
    });

    // The unit-less numbers are gone; the printed-unit room and the unit count stay.
    expect(variant.details).toEqual({
      totalUnitsOfVariant: 24,
      dimensions: { rooms: [{ name: "Study", lengthFt: 9.84, widthFt: 9.84 }] },
    });
  });

  it("does not store a unit it does not recognise, and never falls back to feet", async () => {
    const variant = await variantOf({
      "project-details": project(),
      "floor-plans": dims({
        lengthUnit: "cubits",
        rooms: [{ name: "Living", length: 4.36, width: 7 }],
      }),
    });

    expect(variant.details.dimensions?.rooms).toEqual([]);
  });

  it("ignores measurements in our own canonical shape: they carry no unit, so they are not trusted", async () => {
    const variant = await variantOf({
      "project-details": project(),
      "floor-plans": floorPlans({
        areas: [{ basis: "carpet", areaSqft: 875 }],
        dimensions: {
          rooms: [{ name: "Living", lengthFt: 15, widthFt: 12 }],
        },
      }),
    });

    expect(variant.details.areas).toBeUndefined();
    expect(variant.details.dimensions?.rooms).toEqual([]);
  });

  it("converts a plot area printed in square yards, and leaves out one with no unit", async () => {
    const withUnit = await adapterFor({
      "project-details": project({
        fields: [
          {
            fieldKey: "property.plot_area_sqft",
            value: 200,
            unit: "sq yd",
            evidence: [{ pageNumber: 1, sourceSnippet: "200 sq yd" }],
          },
        ],
      }),
      "floor-plans": floorPlans({}),
    }).extract(request("job-plot-a"));
    expect(
      withUnit.extraction.fields.find(
        (field) => field.fieldKey === "property.plot_area_sqft",
      )?.value,
    ).toBe(1800);

    const withoutUnit = await adapterFor({
      "project-details": project({
        fields: [
          {
            fieldKey: "property.plot_area_sqft",
            value: 1800,
            evidence: [{ pageNumber: 1, sourceSnippet: "1800" }],
          },
        ],
      }),
      "floor-plans": floorPlans({}),
    }).extract(request("job-plot-b"));
    expect(
      withoutUnit.extraction.fields.some(
        (field) => field.fieldKey === "property.plot_area_sqft",
      ),
    ).toBe(false);
  });

  it("converts exactly once: the same saved answer always gives the same result, and re-validating it changes nothing", async () => {
    const answers = {
      "project-details": project(),
      "floor-plans": dims({
        lengthUnit: "m",
        rooms: [{ name: "BED ROOM", length: 4.36, width: 7 }],
      }),
    };

    const first = await variantOf(answers);
    const second = await variantOf(answers);
    expect(second.details).toEqual(first.details);
    expect(first.details.dimensions?.rooms).toEqual([
      { name: "BED ROOM", lengthFt: 14.3, widthFt: 22.97 },
    ]);

    // The result is canonical (feet). Passing it through the canonical validator
    // that ingestion uses must not convert it again.
    const extraction = (
      await adapterFor(answers).extract(request("job-units-revalidate"))
    ).extraction;
    const revalidated = validateNewPipelineExtraction(
      structuredClone(extraction),
      manifest,
      activeFields,
      "ocr-v1",
      "v1",
    );
    expect(revalidated.unitVariants[0].details).toEqual(first.details);

    // And handing the canonical result back to the converter as if it were a
    // model answer converts nothing and stores nothing: it has no printed unit.
    const again = await variantOf({
      "project-details": project(),
      "floor-plans": floorPlans(first.details),
    });
    expect(again.details.dimensions?.rooms).toEqual([]);
  });
});
