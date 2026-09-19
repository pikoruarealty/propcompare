import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import {
  buildWindows,
  createOpenRouterPageRouter,
  groupSuggestions,
  hasFloorPlans,
  PageRouterError,
  parseRouterWindow,
} from "./page-router";

const makePdf = async (pages: number) => {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) pdf.addPage([300, 400]);
  return pdf.save();
};

const reply = (pages: object[]) =>
  new Response(
    JSON.stringify({
      choices: [
        {
          message: { content: JSON.stringify({ pages }) },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1000, completion_tokens: 50 },
    }),
    { status: 200 },
  );

describe("parseRouterWindow", () => {
  it("maps window-local pages to brochure pages and cleans the entries", () => {
    const result = parseRouterWindow(
      {
        pages: [
          {
            page: 1,
            category: "floor_plan",
            confidence: 1.4,
            imagery: ["floor_plan", "bogus", "floor_plan"],
            caption: " 3 BHK - A ",
          },
          { page: 2, category: "amenities", confidence: 0.6, imagery: [] },
        ],
      },
      [41, 42],
    );
    expect(result).toEqual([
      {
        page: 41,
        category: "floor_plan",
        confidence: 1,
        imagery: ["floor_plan"],
        caption: "3 BHK - A",
      },
      { page: 42, category: "amenities", confidence: 0.6, imagery: [] },
    ]);
  });

  it("marks a page the model skipped as unclassified, not trusted", () => {
    const result = parseRouterWindow(
      { pages: [{ page: 1, category: "other", confidence: 0.9, imagery: [] }] },
      [7, 8],
    );
    expect(result[1]).toEqual({
      page: 8,
      category: "other",
      confidence: 0,
      imagery: [],
    });
  });

  it.each([
    ["not an object", "x"],
    ["no pages", {}],
    ["page out of range", { pages: [{ page: 3, category: "other" }] }],
    ["non-integer page", { pages: [{ page: 1.5, category: "other" }] }],
    ["unknown category", { pages: [{ page: 1, category: "pricing" }] }],
  ])("rejects %s", (_name, raw) => {
    expect(() => parseRouterWindow(raw, [1, 2])).toThrow(PageRouterError);
  });
});

describe("buildWindows", () => {
  it("splits by page cap and keeps every page exactly once, in order", async () => {
    const source = await PDFDocument.load(await makePdf(9));
    const windows = await buildWindows(
      source,
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
      10_000_000,
      4,
    );
    expect(windows.map((w) => w.pages)).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
      [9],
    ]);
  });

  it("halves a window that is over the byte budget", async () => {
    const source = await PDFDocument.load(await makePdf(8));
    const windows = await buildWindows(source, [1, 2, 3, 4, 5, 6, 7, 8], 1, 8);
    expect(windows.map((w) => w.pages).flat()).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(windows.every((w) => w.pages.length === 1)).toBe(true);
  });
});

describe("createOpenRouterPageRouter", () => {
  it("requires an API key", () => {
    const previous = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      expect(() => createOpenRouterPageRouter()).toThrow(PageRouterError);
    } finally {
      if (previous !== undefined) process.env.OPENROUTER_API_KEY = previous;
    }
  });

  it("routes a brochure across windows and reports usage", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        reply([
          {
            page: 1,
            category: "project_details",
            confidence: 0.9,
            imagery: ["exterior_render"],
          },
          {
            page: 2,
            category: "amenities",
            confidence: 0.8,
            imagery: ["amenity_photo"],
          },
        ]),
      )
      .mockResolvedValueOnce(
        reply([
          {
            page: 1,
            category: "floor_plan",
            confidence: 0.95,
            imagery: ["floor_plan"],
            caption: "2 BHK",
          },
        ]),
      );
    const router = createOpenRouterPageRouter({
      apiKey: "test-key",
      fetch: fetchMock as unknown as typeof fetch,
      retryDelayMs: 0,
    });

    // 3 pages, 2 per window via a tiny byte budget that forces splitting.
    const bytes = await makePdf(3);
    const source = await PDFDocument.load(bytes);
    const windows = await buildWindows(source, [1, 2, 3], 10_000_000, 2);
    expect(windows).toHaveLength(2);

    const result = await router.route(bytes);
    // The default budget keeps 3 tiny pages in one window; the mock's second reply is unused.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.suggestions.map((s) => s.page)).toEqual([1, 2, 3]);
    expect(result.suggestions[2]).toMatchObject({
      category: "other",
      confidence: 0,
    });
    expect(result.usage).toEqual({
      requests: 1,
      promptTokens: 1000,
      completionTokens: 50,
    });

    const request = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(request.model).toBe("google/gemini-2.5-flash");
    expect(request.plugins).toEqual([
      { id: "file-parser", pdf: { engine: "native" } },
    ]);
    expect(request.messages[0].content[1].text).toMatch(
      /Do not transcribe any text, price/,
    );
  });

  it("retries a transient failure once, then gives up with a clear error", async () => {
    const fail = () => new Response("busy", { status: 503 });
    const ok = vi
      .fn()
      .mockResolvedValueOnce(fail())
      .mockResolvedValueOnce(
        reply([{ page: 1, category: "other", confidence: 0.5, imagery: [] }]),
      );
    const router = createOpenRouterPageRouter({
      apiKey: "k",
      fetch: ok as unknown as typeof fetch,
      retryDelayMs: 0,
    });
    const result = await router.route(await makePdf(1));
    expect(result.suggestions).toHaveLength(1);
    expect(ok).toHaveBeenCalledTimes(2);

    const alwaysFail = vi.fn().mockImplementation(async () => fail());
    const failing = createOpenRouterPageRouter({
      apiKey: "k",
      fetch: alwaysFail as unknown as typeof fetch,
      retryDelayMs: 0,
    });
    await expect(failing.route(await makePdf(1))).rejects.toMatchObject({
      code: "provider_error",
    });
  });

  it("rejects a reply that is not JSON", async () => {
    const bad = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: "not json" }, finish_reason: "stop" },
          ],
        }),
        { status: 200 },
      ),
    );
    const router = createOpenRouterPageRouter({
      apiKey: "k",
      fetch: bad as unknown as typeof fetch,
    });
    await expect(router.route(await makePdf(1))).rejects.toMatchObject({
      code: "invalid_response",
    });
  });
});

describe("grouping and the floor-plan rule", () => {
  const suggestions = [
    {
      page: 1,
      category: "project_details" as const,
      confidence: 1,
      imagery: [],
    },
    { page: 2, category: "other" as const, confidence: 1, imagery: [] },
  ];

  it("groups pages by category", () => {
    expect(groupSuggestions(suggestions)).toMatchObject({
      project_details: [1],
      other: [2],
      floor_plan: [],
    });
  });

  it("only asks for floor-plan extraction when a floor plan was found", () => {
    expect(hasFloorPlans(suggestions)).toBe(false);
    expect(
      hasFloorPlans([
        ...suggestions,
        { page: 3, category: "floor_plan", confidence: 0.9, imagery: [] },
      ]),
    ).toBe(true);
  });
});
