import { describe, expect, it } from "vitest";
import { createGujreraAdapter, type FetchLike } from "./gujrera";
import {
  detailResponse,
  inventoryResponse,
  kimanaSearchHit,
  KIMANA_NUMBER,
  POISON,
  POISON_TEXT,
  progressResponse,
  quartersResponse,
  searchResponse,
  summaryResponse,
} from "./gujrera.fixtures";
import { RegulatorError } from "./types";

type Routes = Record<string, unknown | (() => Response)>;

/** A stand-in for GujRERA: answers by path, records every call. */
const fakeSite = (overrides: Routes = {}) => {
  const calls: { url: string; method: string; body: string | null }[] = [];
  const routes: Routes = {
    "/project_reg/public/global-search": searchResponse(),
    "/project_reg/public/getproject-details/17929": detailResponse,
    "/project_reg/public/alldatabyprojectid/17929": summaryResponse,
    "/formone/public/getfrom-one-progs-rept-projectid/17929": progressResponse,
    "/formthree/public/get-fromthree-a-details-byid/417562": inventoryResponse,
    "/quarter/public/getprojectqtrs/17929": quartersResponse,
    ...overrides,
  };
  const fetchImpl: FetchLike = async (url, init) => {
    const path = new URL(url).pathname;
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : null,
    });
    const route = routes[path];
    if (route === undefined) return new Response("nope", { status: 404 });
    if (typeof route === "function") return (route as () => Response)();
    return new Response(JSON.stringify(route), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { fetchImpl, calls };
};

const adapterFor = (site: ReturnType<typeof fakeSite>) =>
  createGujreraAdapter({
    fetchImpl: site.fetchImpl,
    delayMs: 0,
    now: () => new Date("2026-09-20T06:00:00.000Z"),
  });

describe("GujRERA adapter — a full record", () => {
  it("reads the facts we hold fields for", async () => {
    const record =
      await adapterFor(fakeSite()).lookupByRegistrationNumber(KIMANA_NUMBER);

    expect(record).toMatchObject({
      regulatorCode: "gujrera",
      registrationNumber: KIMANA_NUMBER,
      externalProjectId: "17929",
      projectName: "The Kimana Towers",
      promoterName: "SUN VN DEVELOPERS LLP",
      promoterType: "LIMITED LIABILITY PARTNERSHIP FIRM",
      registeredFrom: "2022-06-21",
      completionDate: "2027-04-30",
      district: "Ahmedabad",
      totalUnits: 76,
      constructionProgressPercent: 67.71875,
      gaps: [],
      fetchedAt: "2026-09-20T06:00:00.000Z",
    });
  });

  it("reports the latest quarterly filing, ignoring other filing kinds", async () => {
    const record =
      await adapterFor(fakeSite()).lookupByRegistrationNumber(KIMANA_NUMBER);

    expect(record.latestQuarter).toEqual({
      name: "Q-14",
      periodEndsOn: "2026-06-30",
      dueOn: "2026-07-07",
      submittedOn: "2026-07-03",
      status: "SUBMITTED",
    });
  });

  it("lets no price and no contact detail into the record", async () => {
    const record =
      await adapterFor(fakeSite()).lookupByRegistrationNumber(KIMANA_NUMBER);
    const everything = JSON.stringify(record);

    // The fixtures carry prices and contact details on purpose.
    expect(everything).not.toContain(String(POISON));
    expect(everything).not.toContain(POISON_TEXT);
    expect(everything).not.toMatch(
      /cost|price|amount|consider|penalt|email|mobile/i,
    );
  });

  it("accepts the number in any case and spacing", async () => {
    const site = fakeSite();
    const record = await adapterFor(site).lookupByRegistrationNumber(
      `  ${KIMANA_NUMBER.toLowerCase()}  `,
    );

    expect(record.registrationNumber).toBe(KIMANA_NUMBER);
    expect(JSON.parse(site.calls[0].body!)).toMatchObject({
      query: KIMANA_NUMBER,
    });
  });

  it("asks politely: one request at a time, a plain user agent, no credentials", async () => {
    const seen: RequestInit[] = [];
    const site = fakeSite();
    const adapter = createGujreraAdapter({
      delayMs: 0,
      fetchImpl: async (url, init) => {
        seen.push(init ?? {});
        return site.fetchImpl(url, init);
      },
    });
    await adapter.lookupByRegistrationNumber(KIMANA_NUMBER);

    expect(seen.length).toBe(6);
    for (const init of seen) {
      const headers = init.headers as Record<string, string>;
      expect(headers["User-Agent"]).toMatch(/^PropCompare-RERA-Check/);
      expect(headers).not.toHaveProperty("Authorization");
      expect(headers).not.toHaveProperty("Cookie");
    }
  });
});

describe("GujRERA adapter — numbers it will not send", () => {
  it.each([
    ["", "empty"],
    ["MH/AHMEDABAD/123", "another state's prefix"],
    ["RAA10879", "a fragment"],
    [`PR/GJ/${"A".repeat(300)}`, "too long"],
    ["PR/GJ/x'; drop table--", "unexpected characters"],
  ])("refuses %j (%s) without calling the site", async (input) => {
    const site = fakeSite();
    await expect(
      adapterFor(site).lookupByRegistrationNumber(input),
    ).rejects.toMatchObject({ code: "invalid_number" });
    expect(site.calls).toHaveLength(0);
  });

  it("owns only Gujarat numbers", () => {
    const adapter = createGujreraAdapter();
    expect(adapter.ownsRegistrationNumber(KIMANA_NUMBER)).toBe(true);
    expect(adapter.ownsRegistrationNumber("P52100012345")).toBe(false);
  });
});

describe("GujRERA adapter — finding the project", () => {
  it("does not accept a near match", async () => {
    const site = fakeSite({
      "/project_reg/public/global-search": searchResponse([
        { ...kimanaSearchHit, regNo: `${KIMANA_NUMBER}/EXTRA` },
      ]),
    });

    await expect(
      adapterFor(site).lookupByRegistrationNumber(KIMANA_NUMBER),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("does not accept an agent or promoter that happens to match", async () => {
    const site = fakeSite({
      "/project_reg/public/global-search": searchResponse([
        { ...kimanaSearchHit, entityType: "AGENT" },
      ]),
    });

    await expect(
      adapterFor(site).lookupByRegistrationNumber(KIMANA_NUMBER),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("refuses to guess between two projects under one number", async () => {
    const site = fakeSite({
      "/project_reg/public/global-search": searchResponse([
        kimanaSearchHit,
        { ...kimanaSearchHit, entityId: 5 },
      ]),
    });

    await expect(
      adapterFor(site).lookupByRegistrationNumber(KIMANA_NUMBER),
    ).rejects.toMatchObject({ code: "ambiguous" });
  });

  it("refuses a project id that is not a plain number", async () => {
    const site = fakeSite({
      "/project_reg/public/global-search": searchResponse([
        { ...kimanaSearchHit, entityId: "17929/../../admin" },
      ]),
    });

    await expect(
      adapterFor(site).lookupByRegistrationNumber(KIMANA_NUMBER),
    ).rejects.toMatchObject({ code: "unexpected_response" });
    expect(site.calls).toHaveLength(1);
  });
});

describe("GujRERA adapter — when the site misbehaves", () => {
  it("says the site is unavailable on a server error", async () => {
    const site = fakeSite({
      "/project_reg/public/global-search": () =>
        new Response("boom", { status: 503 }),
    });

    await expect(
      adapterFor(site).lookupByRegistrationNumber(KIMANA_NUMBER),
    ).rejects.toMatchObject({ code: "unavailable" });
  });

  it("says the site is unavailable when the connection fails", async () => {
    const adapter = createGujreraAdapter({
      delayMs: 0,
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      },
    });

    await expect(
      adapter.lookupByRegistrationNumber(KIMANA_NUMBER),
    ).rejects.toBeInstanceOf(RegulatorError);
  });

  it("fails on a page it cannot read, rather than returning an empty record", async () => {
    const site = fakeSite({
      "/project_reg/public/global-search": () =>
        new Response("<html>maintenance</html>", { status: 200 }),
    });

    await expect(
      adapterFor(site).lookupByRegistrationNumber(KIMANA_NUMBER),
    ).rejects.toMatchObject({ code: "unexpected_response" });
  });

  it("fails when the registration detail is empty", async () => {
    // GujRERA answers an unknown id with 200 and an empty data object.
    const site = fakeSite({
      "/project_reg/public/getproject-details/17929": {
        status: 200,
        data: {},
      },
    });

    await expect(
      adapterFor(site).lookupByRegistrationNumber(KIMANA_NUMBER),
    ).rejects.toMatchObject({ code: "unexpected_response" });
  });

  it("still returns a record when optional pieces are missing, and says which", async () => {
    const site = fakeSite({
      "/formone/public/getfrom-one-progs-rept-projectid/17929": () =>
        new Response("Data Not Found", { status: 200 }),
      "/quarter/public/getprojectqtrs/17929": () =>
        new Response("no", { status: 500 }),
    });

    const record =
      await adapterFor(site).lookupByRegistrationNumber(KIMANA_NUMBER);

    expect(record.constructionProgressPercent).toBeNull();
    expect(record.latestQuarter).toBeNull();
    expect(record.gaps).toEqual(["construction progress", "quarterly filings"]);
    // What did arrive is intact.
    expect(record.totalUnits).toBe(76);
    expect(record.projectName).toBe("The Kimana Towers");
  });

  it("ignores a progress figure outside 0–100 rather than storing it", async () => {
    const site = fakeSite({
      "/formone/public/getfrom-one-progs-rept-projectid/17929": {
        ...progressResponse,
        data: 240,
      },
    });

    const record =
      await adapterFor(site).lookupByRegistrationNumber(KIMANA_NUMBER);

    expect(record.constructionProgressPercent).toBeNull();
  });

  it("does not invent a unit count when the inventory is not a positive whole number", async () => {
    const site = fakeSite({
      "/formthree/public/get-fromthree-a-details-byid/417562": {
        ...inventoryResponse,
        numberOfUnits: 0,
      },
    });

    const record =
      await adapterFor(site).lookupByRegistrationNumber(KIMANA_NUMBER);

    expect(record.totalUnits).toBeNull();
  });
});
