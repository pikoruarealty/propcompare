import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_STATED_RANGE,
  EMPTY_ANSWERS,
  type IntakeAnswers,
  RANGE_MAX_LAKH,
} from "./intake";
import {
  MATCHES_ENDPOINT,
  describeSearchedSpan,
  isOpenEndedTop,
  matchRequestBody,
  requestMatches,
} from "./intake-matches";
import { findForbiddenKeys } from "./no-price";
import { propertyListFixture } from "./fixtures";
import { DEFAULT_PAGE_SIZE } from "./types";

/**
 * The intake → `POST /api/v1/discovery/matches` bridge.
 *
 * Two rules carry most of the weight here. The request body is the only shape
 * in the client allowed to carry `Inr` keys, and it must carry nothing beyond
 * the contract's fields; and a failed request must be distinguishable from an
 * empty one, because a screen that renders the first as the second tells the
 * buyer the catalog is empty when it is not.
 */

const answersWith = (patch: Partial<IntakeAnswers>): IntakeAnswers => ({
  ...EMPTY_ANSWERS,
  ...patch,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("matchRequestBody", () => {
  it("converts the stated range from lakh to rupees", () => {
    const body = matchRequestBody(
      answersWith({ statedRange: { fromLakh: 50, toLakh: 150 } }),
    );

    expect(body).toEqual({
      minInr: 5_000_000,
      maxInr: 15_000_000,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    });
  });

  it("carries the city and configuration when they were stated", () => {
    const body = matchRequestBody(
      answersWith({
        statedRange: DEFAULT_STATED_RANGE,
        city: "Ahmedabad",
        bhk: "3bhk",
      }),
    );

    expect(body).toMatchObject({ city: "Ahmedabad", bhk: "3bhk" });
  });

  it("omits an unstated city or configuration rather than sending an empty one", () => {
    // The endpoint rejects an empty string with a 422 — "every city" and "the
    // empty-string city" are different requests, and neither was intended.
    const body = matchRequestBody(
      answersWith({ statedRange: DEFAULT_STATED_RANGE, city: "Surat" }),
    );

    expect(body).not.toHaveProperty("bhk");
    expect(Object.keys(body ?? {}).sort()).toEqual([
      "city",
      "maxInr",
      "minInr",
      "page",
      "pageSize",
    ]);
  });

  it("sends no field the contract does not define", () => {
    const contractFields = new Set([
      "minInr",
      "maxInr",
      "city",
      "bhk",
      "page",
      "pageSize",
    ]);

    const body = matchRequestBody(
      answersWith({
        statedRange: DEFAULT_STATED_RANGE,
        city: "Ahmedabad",
        bhk: "2bhk",
        // Priorities map to no filter this endpoint accepts. If they ever reach
        // the wire, someone has invented a contract no document defines.
        priorities: ["family_space", "privacy"],
      }),
    );

    for (const key of Object.keys(body ?? {})) {
      expect(contractFields).toContain(key);
    }
  });

  it("returns null when no range was stated", () => {
    // Not a failure: the endpoint requires both bounds, so there is no request
    // to make. Inventing a default range would put a figure in the buyer's
    // mouth that they deliberately declined to state.
    expect(matchRequestBody(EMPTY_ANSWERS)).toBeNull();
    expect(matchRequestBody(answersWith({ city: "Surat" }))).toBeNull();
  });

  it("carries the requested page", () => {
    const body = matchRequestBody(
      answersWith({ statedRange: DEFAULT_STATED_RANGE }),
      3,
    );

    expect(body?.page).toBe(3);
  });
});

describe("the answers themselves stay free of price-shaped keys", () => {
  it("keeps the Inr names in the request body and nowhere else", () => {
    const answers = answersWith({
      statedRange: { fromLakh: 60, toLakh: 90 },
      city: "Ahmedabad",
      bhk: "2bhk",
    });

    // `no-price.ts` matches /inr/i and runs in production. The whole reason
    // this module is separate from `./intake.ts` is to keep that true.
    expect(findForbiddenKeys(answers)).toEqual([]);
    expect(findForbiddenKeys(matchRequestBody(answers))).not.toEqual([]);
  });
});

describe("describeSearchedSpan", () => {
  it("describes the ±20% expansion in the buyer's own units", () => {
    // ₹50 lakh–₹1.5 crore stated becomes ₹40 lakh–₹1.8 crore searched.
    expect(describeSearchedSpan({ fromLakh: 50, toLakh: 150 })).toBe(
      "₹40 lakh to ₹1.8 crore",
    );
  });

  it("crosses from lakh into crore where the figure does", () => {
    expect(describeSearchedSpan({ fromLakh: 100, toLakh: 100 })).toBe(
      "₹80 lakh to ₹1.2 crore",
    );
  });
});

describe("isOpenEndedTop", () => {
  it("is true only at the top of the scale, where the control says 'or more'", () => {
    expect(isOpenEndedTop({ fromLakh: 10, toLakh: RANGE_MAX_LAKH })).toBe(true);
    expect(isOpenEndedTop({ fromLakh: 10, toLakh: RANGE_MAX_LAKH - 5 })).toBe(
      false,
    );
  });
});

describe("requestMatches", () => {
  const body = matchRequestBody(
    answersWith({ statedRange: DEFAULT_STATED_RANGE }),
  )!;

  it("posts the body as JSON to the contract's route", async () => {
    // Typed rather than inferred, so `mock.calls` carries the url and the init
    // the assertions below read off it.
    const fetchSpy = vi.fn<
      (url: string, init: RequestInit) => Promise<Response>
    >(async () => Response.json(propertyListFixture));
    vi.stubGlobal("fetch", fetchSpy);

    const outcome = await requestMatches(body);

    expect(outcome).toEqual({ ok: true, result: propertyListFixture });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(MATCHES_ENDPOINT);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(body);
  });

  it("reports a rejected request distinctly from an empty result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: { code: "invalid_request_body", message: "minInr …" } },
          { status: 422 },
        ),
      ),
    );

    const outcome = await requestMatches(body);

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.message).toMatch(
      /could not be run/i,
    );
  });

  it("does not surface the endpoint's developer-facing message to the buyer", async () => {
    // `message` names an offending field by its contract name — which includes
    // `minInr`. Rendering it would put a price-shaped string on screen.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            error: {
              code: "invalid_request_body",
              message: "minInr must be a finite positive number.",
            },
          },
          { status: 422 },
        ),
      ),
    );

    const outcome = await requestMatches(body);

    expect(outcome.ok === false && outcome.message).not.toMatch(/minInr/);
  });

  it("returns a message rather than throwing when the network fails", async () => {
    // An unhandled rejection in the client component would take the flow, and
    // every answer in it, down with it.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    const outcome = await requestMatches(body);

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.message).toMatch(
      /Nothing you entered has been lost/,
    );
  });

  it("returns a message rather than throwing on an unparseable body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not json", { status: 200 })),
    );

    expect((await requestMatches(body)).ok).toBe(false);
  });
});
