import { PDFDocument } from "pdf-lib";

/**
 * The page-routing pass: a cheap vision model looks at every page of a brochure
 * and *suggests* what each page is, so a human confirms categories instead of
 * assigning them from scratch (DECISIONS.md 2026-09-20).
 *
 * Why a vision model and not text scanning: a text-layer keyword scorer found no
 * floor plan in any of the three test brochures, because floor plans are pure
 * images (docs/tasklists/2026-09-02-ocr-provider-selection.md, finding 1).
 *
 * Output is advisory. Nothing here queues extraction, creates a routing scope, or
 * touches a live table; the suggestions are stored on the draft job and the admin
 * confirms or changes every page. The model is told not to transcribe prices, and
 * the response schema has no field a price could go in.
 *
 * Whole brochures are too large for one request (the largest test brochure is
 * 62 MB), so pages are sent in consecutive windows under a byte budget and the
 * window-local page numbers are mapped back to brochure page numbers here.
 */

export const PAGE_CATEGORIES = [
  "project_details",
  "amenities",
  "specifications",
  "floor_plan",
  "other",
] as const;
export type PageCategory = (typeof PAGE_CATEGORIES)[number];

export const IMAGERY_TAGS = [
  "exterior_render",
  "amenity_photo",
  "interior",
  "floor_plan",
  "site_plan",
  "location_map",
  "logo",
  "other",
] as const;
export type ImageryTag = (typeof IMAGERY_TAGS)[number];

/**
 * How imagery sits on a page, so a later step can choose between using the whole
 * page as the image and pulling out individual pictures. Only meaningful on a page
 * that shows imagery; a text-only page has none.
 *  - `full_page`: one image (or the page design itself) fills the page.
 *  - `multiple_images`: several separate images share the page, labelled or not.
 *  - `single_with_decoration`: one main image plus other decorative elements.
 */
export const IMAGE_LAYOUTS = [
  "full_page",
  "multiple_images",
  "single_with_decoration",
] as const;
export type ImageLayout = (typeof IMAGE_LAYOUTS)[number];

export interface PageSuggestion {
  /** One-based brochure page number. */
  page: number;
  category: PageCategory;
  /** 0–1. Zero means the model did not classify the page at all. */
  confidence: number;
  imagery: ImageryTag[];
  /** A non-authoritative label a human may use, e.g. "3 BHK - Type A". */
  caption?: string;
  /** Present only when the page shows imagery. A hint, never a decision. */
  imageLayout?: ImageLayout;
}

export interface PageRouterRequestUsage {
  /** Provider request id, for reconciling against the provider dashboard. */
  providerRequestId?: string;
  promptTokens: number;
  completionTokens: number;
  /** Provider-reported cost in USD; absent when the provider did not report it. */
  costUsd?: number;
}

export interface PageRouterUsage {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  /** Sum of reported costs; absent when no request reported one. */
  costUsd?: number;
  /** One entry per provider request, for the admin-only usage ledger. */
  perRequest: PageRouterRequestUsage[];
}

export interface PageRoutingResult {
  model: string;
  suggestions: PageSuggestion[];
  usage: PageRouterUsage;
}

export class PageRouterError extends Error {
  constructor(
    public readonly code:
      | "configuration_error"
      | "provider_error"
      | "insufficient_credits"
      | "request_timeout"
      | "invalid_response",
    message: string,
    /**
     * What was already billed before the failure (earlier windows that
     * succeeded), so a failed run still reaches the usage ledger.
     */
    public usage?: PageRouterUsage,
  ) {
    super(message);
    this.name = "PageRouterError";
  }
}

const DEFAULT_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
export const DEFAULT_ROUTER_MODEL = "google/gemini-2.5-flash";
const DEFAULT_WINDOW_BYTE_BUDGET = 12 * 1024 * 1024;
const MAX_WINDOW_PAGES = 40;
const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const stripCodeFence = (text: string): string =>
  text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

/**
 * Validates one window's response against the pages actually sent. A page the
 * model skipped becomes `other` with confidence 0 so the human sees it as
 * unclassified rather than silently trusted; a page number outside the window,
 * an unknown category, or a non-array response is a hard failure — a router that
 * hallucinates pages is not one whose other answers can be trusted.
 */
export const parseRouterWindow = (
  raw: unknown,
  windowPages: number[],
): PageSuggestion[] => {
  if (!isRecord(raw) || !Array.isArray(raw.pages)) {
    throw new PageRouterError(
      "invalid_response",
      "Router response has no pages array",
    );
  }
  const allowed = new Set(windowPages);
  const byPage = new Map<number, PageSuggestion>();

  for (const entry of raw.pages) {
    if (!isRecord(entry)) {
      throw new PageRouterError(
        "invalid_response",
        "Router page is not an object",
      );
    }
    const localPage = entry.page;
    if (
      typeof localPage !== "number" ||
      !Number.isInteger(localPage) ||
      localPage < 1 ||
      localPage > windowPages.length
    ) {
      throw new PageRouterError(
        "invalid_response",
        `Router returned an out-of-range page: ${String(localPage)}`,
      );
    }
    const page = windowPages[localPage - 1];
    if (!allowed.has(page)) continue;

    const category = entry.category;
    if (!PAGE_CATEGORIES.includes(category as PageCategory)) {
      throw new PageRouterError(
        "invalid_response",
        `Router returned an unknown category for page ${page}: ${String(category)}`,
      );
    }
    const confidence =
      typeof entry.confidence === "number"
        ? Math.min(1, Math.max(0, entry.confidence))
        : 0.5;
    const imagery = Array.isArray(entry.imagery)
      ? [
          ...new Set(
            entry.imagery.filter((tag): tag is ImageryTag =>
              IMAGERY_TAGS.includes(tag as ImageryTag),
            ),
          ),
        ]
      : [];
    const caption =
      typeof entry.caption === "string" && entry.caption.trim()
        ? entry.caption.trim().slice(0, 120)
        : undefined;

    // Only kept when the page has imagery and the value is one we know; an
    // unrecognised value is dropped rather than failing the whole window.
    const imageLayout =
      imagery.length > 0 &&
      IMAGE_LAYOUTS.includes(entry.imageLayout as ImageLayout)
        ? (entry.imageLayout as ImageLayout)
        : undefined;

    byPage.set(page, {
      page,
      category: category as PageCategory,
      confidence,
      imagery,
      ...(caption ? { caption } : {}),
      ...(imageLayout ? { imageLayout } : {}),
    });
  }

  return windowPages.map(
    (page) =>
      byPage.get(page) ?? {
        page,
        category: "other" as const,
        confidence: 0,
        imagery: [],
      },
  );
};

const createPrompt = (pageCount: number): string =>
  `You are classifying the pages of a real-estate brochure for an Ahmedabad property catalog. This PDF excerpt has ${pageCount} page${pageCount === 1 ? "" : "s"}, numbered 1 to ${pageCount} in order.

For EVERY page return one entry. Categories:
- "project_details": the project's name, developer, location/address, RERA number, tower/unit counts, possession, site plan, master plan, project overview or developer profile.
- "amenities": amenity or clubhouse lists and layouts; a marketing spread that names one amenity — a full-page photo of a single facility (pool, gym, clubhouse, lounge, play area, sports court, and so on) captioned with that facility's name or a short phrase built from it, even with no list of other amenities on the same page; OR a page whose main subject is the project's amenities as a whole, marketed generically (a count such as "30+ amenities" or a phrase like "club-class"/"world-class amenities") paired with a photo of an amenity space, even with no itemized list and no single facility named. A page that only mentions amenities in passing among unrelated project information is NOT an amenities page for that reason alone. A page that is just a lifestyle photo with no named facility and no amenities framing (people relaxing, a skyline, an interior with no caption) is NOT an amenity page.
- "specifications": construction, finish, fittings and flooring specification lists; also a location/connectivity page that names nearby landmarks (malls, hospitals, schools, metro/airport/railway, clubs) with a distance or travel time given for each, even when the page is built around a map graphic.
- "floor_plan": drawn unit floor plans (dimensioned or not), including duplex/penthouse levels and typical floor layouts. A location map or site plan is NOT a floor plan.
- "other": cover pages, lifestyle or marketing imagery with no named facility and no amenities framing, a location map or site plan showing only a graphic with no printed list of named landmarks and distances, legal or disclaimer pages, contact pages, anything else.

For each page also list "imagery" tags for what is visibly on the page, from: ${IMAGERY_TAGS.join(", ")}. Use an empty list for a text-only page.
For a "floor_plan" page you may add a short "caption" if the page names the unit (for example "3 BHK - Type A"); otherwise omit it. A caption is only a hint.
For an "amenities" page that is a single-facility marketing spread, add a short "caption" naming that one facility — a plain noun phrase such as "Swimming Pool", "Gymnasium", or "Rooftop Lounge". Never return the page's marketing tagline as the caption: phrases like "Dive in for sheer bliss" or "Elevate your fitness journey" describe a feeling, not a facility, even when they are the only text printed on the page. If the printed text is a tagline rather than a facility name, name the facility from what the image itself shows instead of quoting the tagline. Omit the caption for a page that already lists several amenities together. A caption is only a hint.
For a page that shows imagery, also give "imageLayout": "full_page" if one image or the page's own design fills the page, "multiple_images" if several separate images share it (labelled or not), or "single_with_decoration" if there is one main image plus other decorative elements. Omit "imageLayout" for a text-only page.
"confidence" is between 0 and 1 for the category.

Do not transcribe any text, price, area, rate or other figure. Return ONLY JSON of the form:
{"pages":[{"page":1,"category":"other","confidence":0.9,"imagery":["exterior_render"],"imageLayout":"full_page"}]}`;

export interface PageRouterOptions {
  /**
   * Turns the brochure into what is actually sent (the same pages, in the same
   * order). Production passes `lightenBrochure` so no request carries the
   * original's heavy artwork; tests send the bytes as they are.
   */
  prepare?: (pdfBytes: Uint8Array) => Promise<Uint8Array>;
  apiKey?: string;
  model?: string;
  endpoint?: string;
  fetch?: typeof fetch;
  requestTimeoutMs?: number;
  retryDelayMs?: number;
  windowByteBudget?: number;
}

const slicePdf = async (
  source: PDFDocument,
  pages: number[],
): Promise<Uint8Array> => {
  const out = await PDFDocument.create();
  const copied = await out.copyPages(
    source,
    pages.map((page) => page - 1),
  );
  for (const page of copied) out.addPage(page);
  return out.save();
};

/**
 * Splits pages into consecutive windows whose actual serialized size stays under
 * the byte budget, halving any window that comes out too large. Sizes are
 * measured on the real slice, not estimated, because brochure page weight varies
 * enormously (a full-bleed render can be 50x a text page).
 */
export const buildWindows = async (
  source: PDFDocument,
  pageNumbers: number[],
  byteBudget: number,
  maxPages = MAX_WINDOW_PAGES,
): Promise<{ pages: number[]; bytes: Uint8Array }[]> => {
  const windows: { pages: number[]; bytes: Uint8Array }[] = [];
  const pending: number[][] = [];
  for (let i = 0; i < pageNumbers.length; i += maxPages) {
    pending.push(pageNumbers.slice(i, i + maxPages));
  }
  while (pending.length > 0) {
    const pages = pending.shift()!;
    const bytes = await slicePdf(source, pages);
    if (bytes.byteLength > byteBudget && pages.length > 1) {
      const middle = Math.ceil(pages.length / 2);
      pending.unshift(pages.slice(0, middle), pages.slice(middle));
      continue;
    }
    windows.push({ pages, bytes });
  }
  return windows;
};

export const createOpenRouterPageRouter = (options: PageRouterOptions = {}) => {
  const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new PageRouterError(
      "configuration_error",
      "OPENROUTER_API_KEY is required",
    );
  }
  const model =
    options.model ??
    process.env.OPENROUTER_ROUTER_MODEL ??
    DEFAULT_ROUTER_MODEL;
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? 1_000;
  const byteBudget = options.windowByteBudget ?? DEFAULT_WINDOW_BYTE_BUDGET;

  const callWindow = async (
    bytes: Uint8Array,
    pageCount: number,
    index: number,
  ): Promise<{
    text: string;
    usage: PageRouterRequestUsage;
  }> => {
    const body = JSON.stringify({
      model,
      max_tokens: 8_000,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "file",
              file: {
                filename: `pages-${index}.pdf`,
                file_data: `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`,
              },
            },
            { type: "text", text: createPrompt(pageCount) },
          ],
        },
      ],
      plugins: [{ id: "file-parser", pdf: { engine: "native" } }],
      response_format: { type: "json_object" },
      // Ask the provider to report what the request cost, for the admin usage ledger.
      usage: { include: true },
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response: Response;
      try {
        response = await fetchImplementation(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const timedOut =
          error instanceof Error &&
          (error.name === "TimeoutError" || error.name === "AbortError");
        // A stall is retried once like any other transient failure: a window that
        // hangs on the provider's side usually answers the second time, and
        // failing the whole run for it wastes the windows already paid for.
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, retryDelayMs));
          continue;
        }
        throw new PageRouterError(
          timedOut ? "request_timeout" : "provider_error",
          timedOut
            ? `Page router timed out after ${timeoutMs}ms`
            : `Page router request failed: ${String(error)}`,
        );
      }

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 1_000);
        const transient =
          response.status === 408 ||
          response.status === 429 ||
          response.status >= 500;
        if (attempt === 0 && transient) {
          await new Promise((r) => setTimeout(r, retryDelayMs));
          continue;
        }
        // 402 is the provider saying the account balance is empty: not a fault
        // in the request, and something an admin can fix, so it gets its own code.
        throw new PageRouterError(
          response.status === 402 ? "insufficient_credits" : "provider_error",
          `Page router returned HTTP ${response.status}: ${detail}`,
        );
      }

      const json = (await response.json()) as {
        choices?: { message?: { content?: unknown }; finish_reason?: string }[];
        id?: string;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          cost?: number;
        };
      };
      const choice = json.choices?.[0];
      if (typeof choice?.message?.content !== "string") {
        throw new PageRouterError(
          "invalid_response",
          "Page router returned no content",
        );
      }
      if (choice.finish_reason && choice.finish_reason !== "stop") {
        throw new PageRouterError(
          "invalid_response",
          `Page router stopped early: ${choice.finish_reason}`,
        );
      }
      return {
        text: choice.message.content,
        usage: {
          ...(typeof json.id === "string"
            ? { providerRequestId: json.id }
            : {}),
          promptTokens: json.usage?.prompt_tokens ?? 0,
          completionTokens: json.usage?.completion_tokens ?? 0,
          ...(typeof json.usage?.cost === "number"
            ? { costUsd: json.usage.cost }
            : {}),
        },
      };
    }
    throw new PageRouterError("provider_error", "Page router retry exhausted");
  };

  return {
    model,
    /** Suggests a category for every page of the brochure, in page order. */
    async route(pdfBytes: Uint8Array): Promise<PageRoutingResult> {
      const source = await PDFDocument.load(
        options.prepare ? await options.prepare(pdfBytes) : pdfBytes,
        { ignoreEncryption: true },
      );
      const pageNumbers = Array.from(
        { length: source.getPageCount() },
        (_, i) => i + 1,
      );
      const windows = await buildWindows(source, pageNumbers, byteBudget);

      const suggestions: PageSuggestion[] = [];
      const usage: PageRouterUsage = {
        requests: 0,
        promptTokens: 0,
        completionTokens: 0,
        perRequest: [],
      };

      try {
        for (const [index, window] of windows.entries()) {
          const result = await callWindow(
            window.bytes,
            window.pages.length,
            index + 1,
          );
          usage.requests += 1;
          usage.promptTokens += result.usage.promptTokens;
          usage.completionTokens += result.usage.completionTokens;
          usage.perRequest.push(result.usage);
          if (result.usage.costUsd !== undefined) {
            usage.costUsd = (usage.costUsd ?? 0) + result.usage.costUsd;
          }

          let parsed: unknown;
          try {
            parsed = JSON.parse(stripCodeFence(result.text));
          } catch {
            throw new PageRouterError(
              "invalid_response",
              "Page router returned invalid JSON",
            );
          }
          suggestions.push(...parseRouterWindow(parsed, window.pages));
        }
      } catch (error) {
        if (error instanceof PageRouterError) error.usage ??= usage;
        throw error;
      }

      suggestions.sort((a, b) => a.page - b.page);
      return { model, suggestions, usage };
    },
  };
};

export type PageRouter = ReturnType<typeof createOpenRouterPageRouter>;

/** Brochure pages grouped by suggested category. */
export const groupSuggestions = (
  suggestions: PageSuggestion[],
): Record<PageCategory, number[]> => {
  const groups: Record<PageCategory, number[]> = {
    project_details: [],
    amenities: [],
    specifications: [],
    floor_plan: [],
    other: [],
  };
  for (const s of suggestions) groups[s.category].push(s.page);
  return groups;
};

/**
 * Whether the brochure needs the floor-plan extraction at all. A brochure with no
 * floor plans is not sent to Claude for floor plans (owner decision 2026-09-20):
 * the scope is simply omitted, and the other scopes are unaffected.
 */
export const hasFloorPlans = (suggestions: PageSuggestion[]): boolean =>
  suggestions.some((s) => s.category === "floor_plan");
