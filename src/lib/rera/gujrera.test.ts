import { describe, expect, it } from "vitest";
import {
  boundaryCentre,
  createGujreraAdapter,
  parseBoundary,
  type FetchLike,
} from "./gujrera";
import {
  amarisDetailResponse,
  amarisFormOneResponse,
  boundaryResponse,
  detailResponse,
  flatListResponse,
  formOneResponse,
  inventoryResponse,
  latestFilingRoutes,
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
    "/formone/public/getfrom-one-byformone-id/278008": formOneResponse,
    ...latestFilingRoutes,
    "/formthree/public/get-inv-details-for-view": flatListResponse,
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
      // The latest quarterly filing's figure, not the older certified one.
      constructionProgressPercent: 93.72324444444445,
      gaps: [],
      fetchedAt: "2026-09-20T06:00:00.000Z",
    });
  });

  it("reads what else the registration says, without turning it into counts", async () => {
    const record =
      await adapterFor(fakeSite()).lookupByRegistrationNumber(KIMANA_NUMBER);

    expect(record).toMatchObject({
      projectDescription: "Residential Apartments",
      landAreaSqm: 7628,
      coveredParkingSlots: 246,
      pincode: null,
      // Two towers are one block here: this is not a tower count.
      blocks: [{ name: "A+B", slabs: 24 }],
    });
  });

  it("does not turn a blank swimming-pool flag into an amenity or a refusal", async () => {
    const record =
      await adapterFor(fakeSite()).lookupByRegistrationNumber(KIMANA_NUMBER);

    expect(record.declaredAmenityKeys).toEqual([]);
  });

  it("declares a swimming pool only when the flag says Yes (Amaris)", async () => {
    const site = fakeSite({
      "/project_reg/public/getproject-details/17929": amarisDetailResponse,
      "/formone/public/getfrom-one-byformone-id/278008": amarisFormOneResponse,
      "/formone/public/getfrom-one-byformone-id/325057": amarisFormOneResponse,
    });

    const record =
      await adapterFor(site).lookupByRegistrationNumber(KIMANA_NUMBER);

    expect(record.declaredAmenityKeys).toEqual(["swimming_pool"]);
    expect(record).toMatchObject({
      projectDescription: "4BHK and 5BHK (Penthouse)",
      pincode: "382481",
      landAreaSqm: 15949,
      coveredParkingSlots: 1327,
    });
    // Four blocks of 14 slabs, reported as listed and nothing more.
    expect(record.blocks.map((block) => block.name)).toEqual([
      "A",
      "B",
      "C",
      "D",
    ]);
    expect(record.blocks.every((block) => block.slabs === 14)).toBe(true);
  });

  it("reports the blocks as a gap, not an error, when they cannot be read", async () => {
    const site = fakeSite({
      "/formone/public/getfrom-one-byformone-id/278008": () =>
        new Response("no", { status: 500 }),
      "/formone/public/getfrom-one-byformone-id/325057": () =>
        new Response("no", { status: 500 }),
    });

    const record =
      await adapterFor(site).lookupByRegistrationNumber(KIMANA_NUMBER);

    expect(record.blocks).toEqual([]);
    // No block names means no way to ask for the flat list either. The older
    // certified progress still stands in for the filing's.
    expect(record.constructionProgressPercent).toBe(67.71875);
    expect(record.gaps).toEqual([
      "latest filing progress",
      "blocks",
      "flat carpet areas",
    ]);
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

    // Search, detail, summary, the latest filing's form ids, its progress and
    // blocks, the certified progress, unit count, one flat list per block,
    // quarterly filings and the boundary.
    expect(seen.length).toBe(10);
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
      "/quarter/public/get-qtr-form-details/17929": () =>
        new Response("no", { status: 500 }),
      "/formone/public/getfrom-one-progs-rept-projectid/17929": () =>
        new Response("Data Not Found", { status: 200 }),
      "/quarter/public/getprojectqtrs/17929": () =>
        new Response("no", { status: 500 }),
    });

    const record =
      await adapterFor(site).lookupByRegistrationNumber(KIMANA_NUMBER);

    expect(record.constructionProgressPercent).toBeNull();
    expect(record.latestQuarter).toBeNull();
    expect(record.gaps).toEqual([
      "latest filing",
      "construction progress",
      "quarterly filings",
    ]);
    // What did arrive is intact.
    expect(record.totalUnits).toBe(76);
    expect(record.projectName).toBe("The Kimana Towers");
  });

  it("ignores a progress figure outside 0–100 rather than storing it", async () => {
    const site = fakeSite({
      "/quarter/public/get-qtr-form-details/17929": () =>
        new Response("no", { status: 500 }),
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
      "/formthree/public/get-fromthree-a-details-byid/446362": {
        ...inventoryResponse,
        numberOfUnits: 0,
      },
    });

    const record =
      await adapterFor(site).lookupByRegistrationNumber(KIMANA_NUMBER);

    expect(record.totalUnits).toBeNull();
  });
});

describe("GujRERA adapter — the second pass (latest filing, areas, boundary)", () => {
  it("reads open and covered area, the authority, filing counts and the team", async () => {
    const record =
      await adapterFor(fakeSite()).lookupByRegistrationNumber(KIMANA_NUMBER);

    expect(record.details).toMatchObject({
      version: 1,
      layoutLandAreaSqm: 7628,
      openAreaSqm: 3131.1,
      coveredAreaSqm: 4496.9,
      coveredParkingAreaSqm: 12553.45,
      planPassingAuthority: "AUDA",
      registeredOn: "2022-11-11",
      filings: { listed: 3, submitted: 3 },
      architects: [{ name: "HM Architects", projectsCompleted: 62 }],
      engineers: [{ name: "Setu Infrastructure", projectsCompleted: 80 }],
      contractors: [{ name: "Builder Ltd", projectsCompleted: 24 }],
    });
  });

  it("labels progress with the quarterly filing it came from, block by block", async () => {
    const record =
      await adapterFor(fakeSite()).lookupByRegistrationNumber(KIMANA_NUMBER);

    expect(record.details?.filing).toMatchObject({
      quarter: "Q-14",
      periodEndsOn: "2026-06-30",
      source: "quarterly_filing",
      progressPercent: 93.72324444444445,
      blocks: [
        {
          name: "A+B",
          progressPercent: 95.86533333333334,
          floors: 22,
          lifts: 8,
          slabs: 24,
        },
      ],
    });
  });

  it("uses the older certified figure, and says so, when no filing can be read", async () => {
    const record = await adapterFor(
      fakeSite({
        "/quarter/public/get-qtr-form-details/17929": () =>
          new Response("no", { status: 500 }),
      }),
    ).lookupByRegistrationNumber(KIMANA_NUMBER);

    expect(record.constructionProgressPercent).toBe(67.71875);
    expect(record.details?.filing).toMatchObject({
      quarter: null,
      source: "certified_form_one",
      progressPercent: 67.71875,
    });
    expect(record.gaps).toContain("latest filing");
  });

  it("states units booked and available as on the date the flat list carries", async () => {
    const record =
      await adapterFor(fakeSite()).lookupByRegistrationNumber(KIMANA_NUMBER);

    expect(record.details?.inventory).toEqual({
      totalUnits: 76,
      bookedUnits: 24,
      availableUnits: 52,
      asOn: "2026-07-03",
    });
  });

  it("takes the centre of the drawn boundary and drops the closing point", async () => {
    const record =
      await adapterFor(fakeSite()).lookupByRegistrationNumber(KIMANA_NUMBER);

    expect(record.details?.boundary).toHaveLength(4);
    expect(record.details?.centre?.lat).toBeCloseTo(23.02727, 4);
    expect(record.details?.centre?.lng).toBeCloseTo(72.48943, 4);
  });

  it("reports a missing boundary as a gap and never reads the cost beside it", async () => {
    const record = await adapterFor(
      fakeSite({
        "/maplocation/public/getProjectLocations/17929": {
          ...boundaryResponse,
          coordinates: [],
        },
      }),
    ).lookupByRegistrationNumber(KIMANA_NUMBER);

    expect(record.details?.boundary).toEqual([]);
    expect(record.details?.centre).toBeNull();
    expect(record.gaps).toContain("boundary");
    expect(JSON.stringify(record)).not.toContain(String(POISON));
  });
});

describe("boundary parsing", () => {
  it("drops points outside India and a ring with fewer than three points left", () => {
    expect(
      parseBoundary([
        { lat: "23.0", lang: "72.4" },
        { lat: "0", lang: "0" },
        { lat: "23.1", lang: "72.5" },
      ]),
    ).toEqual([]);
  });

  it("finds the centre of a square", () => {
    const square = [
      { lat: 23, lng: 72 },
      { lat: 23, lng: 72.002 },
      { lat: 23.002, lng: 72.002 },
      { lat: 23.002, lng: 72 },
    ];
    expect(boundaryCentre(square)).toEqual({ lat: 23.001, lng: 72.001 });
  });
});

describe("GujRERA adapter — carpet area per flat", () => {
  it("reduces the 76-flat list to four carpet areas, in square metres, per block", async () => {
    const site = fakeSite();
    const record =
      await adapterFor(site).lookupByRegistrationNumber(KIMANA_NUMBER);

    expect(record.carpetGroups).toEqual([
      {
        block: "A",
        carpetAreaSqm: 369.54,
        flatCount: 36,
        firstFlat: "A-301",
        lastFlat: "A-2002",
        bookedCount: 12,
        exclusiveAreaMinSqm: 194.42,
        exclusiveAreaMaxSqm: 194.42,
      },
      {
        block: "A",
        carpetAreaSqm: 572.59,
        flatCount: 2,
        firstFlat: "A-2101",
        lastFlat: "A-2102",
        bookedCount: 0,
        exclusiveAreaMinSqm: 194.42,
        exclusiveAreaMaxSqm: 194.42,
      },
      {
        block: "B",
        carpetAreaSqm: 277.26,
        flatCount: 36,
        firstFlat: "B-301",
        lastFlat: "B-2002",
        bookedCount: 12,
        exclusiveAreaMinSqm: 194.42,
        exclusiveAreaMaxSqm: 194.42,
      },
      {
        block: "B",
        carpetAreaSqm: 463.24,
        flatCount: 2,
        firstFlat: "B-2101",
        lastFlat: "B-2102",
        bookedCount: 0,
        exclusiveAreaMinSqm: 194.42,
        exclusiveAreaMaxSqm: 194.42,
      },
    ]);
    expect(record.gaps).toEqual([]);
    // Asked for by the registration's own block name and form-three id.
    const call = site.calls.find((entry) =>
      entry.url.endsWith("/get-inv-details-for-view"),
    );
    expect(call?.method).toBe("POST");
    expect(JSON.parse(call?.body ?? "{}")).toEqual({
      blockName: "A+B",
      formThreeId: 446362,
    });
  });

  it("asks for the flat list once per block the registration lists", async () => {
    const site = fakeSite({
      "/project_reg/public/getproject-details/17929": amarisDetailResponse,
      "/formone/public/getfrom-one-byformone-id/278008": amarisFormOneResponse,
      "/formone/public/getfrom-one-byformone-id/325057": amarisFormOneResponse,
    });
    await adapterFor(site).lookupByRegistrationNumber(KIMANA_NUMBER);
    const asked = site.calls
      .filter((call) => call.url.endsWith("/get-inv-details-for-view"))
      .map((call) => JSON.parse(call.body ?? "{}").blockName);
    expect(asked).toEqual(["A", "B", "C", "D"]);
  });

  it("keeps no price, buyer name, phone number or per-flat row from the list", async () => {
    const record =
      await adapterFor(fakeSite()).lookupByRegistrationNumber(KIMANA_NUMBER);
    const stored = JSON.stringify(record);
    expect(stored).not.toContain(String(POISON));
    expect(stored).not.toContain(POISON_TEXT);
    expect(stored).not.toMatch(
      /allottee|mobile|unitConsideration|received|balance|"(UN)?BOOKED"/i,
    );
    expect(stored).not.toContain("A-305");
  });

  it("reports a failed flat list as a gap and leaves the rest of the record intact", async () => {
    const record = await adapterFor(
      fakeSite({
        "/formthree/public/get-inv-details-for-view": () =>
          new Response("boom", { status: 500 }),
      }),
    ).lookupByRegistrationNumber(KIMANA_NUMBER);

    expect(record.carpetGroups).toEqual([]);
    expect(record.gaps).toEqual(["flat carpet areas"]);
    expect(record.totalUnits).toBe(76);
  });

  it("reports an empty list as a gap, not as 'no carpet areas'", async () => {
    const record = await adapterFor(
      fakeSite({
        "/formthree/public/get-inv-details-for-view": {
          status: 200,
          data: [],
        },
      }),
    ).lookupByRegistrationNumber(KIMANA_NUMBER);
    expect(record.carpetGroups).toEqual([]);
    expect(record.gaps).toEqual(["flat carpet areas"]);
  });

  it("skips commercial flats and impossible areas", async () => {
    const rows = flatListResponse.data.slice(0, 3);
    const record = await adapterFor(
      fakeSite({
        "/formthree/public/get-inv-details-for-view": {
          status: 200,
          data: [
            { ...rows[0], usage: "Commercial" },
            { ...rows[1], carpetArea: 90000 },
            { ...rows[2], carpetArea: 0 },
            { ...rows[0], flatNo: "A-999" },
          ],
        },
      }),
    ).lookupByRegistrationNumber(KIMANA_NUMBER);
    expect(record.carpetGroups).toEqual([
      {
        block: "A",
        carpetAreaSqm: 369.54,
        flatCount: 1,
        firstFlat: "A-999",
        lastFlat: "A-999",
        bookedCount: 1,
        exclusiveAreaMinSqm: 194.42,
        exclusiveAreaMaxSqm: 194.42,
      },
    ]);
  });
});

describe("GujRERA adapter, the project price range", () => {
  const withCosts = (mincost: unknown, maxcost: unknown) =>
    fakeSite({
      "/project_reg/public/global-search": searchResponse([
        { ...kimanaSearchHit, mincost, maxcost },
      ]),
    });

  it("reads the project's stated minimum and maximum cost, and nothing else", async () => {
    const site = withCosts(22_573_000, 66_319_200);
    const range = await adapterFor(site).lookupPriceRange!(KIMANA_NUMBER);

    expect(range).toEqual({ minInr: 22_573_000, maxInr: 66_319_200 });
    // One search request; it does not touch the per-flat list where prices are masked.
    expect(site.calls).toHaveLength(1);
    expect(site.calls[0].url).toContain("/project_reg/public/global-search");
  });

  it("rounds to whole rupees", async () => {
    const range = await adapterFor(withCosts(22_573_000.4, 66_319_200.6))
      .lookupPriceRange!(KIMANA_NUMBER);

    expect(range).toEqual({ minInr: 22_573_000, maxInr: 66_319_201 });
  });

  it.each([
    ["missing", undefined, undefined],
    ["zero", 0, 0],
    ["masked", "******", "******"],
    ["upside down", 66_319_200, 22_573_000],
    ["one bound only", 22_573_000, null],
  ])("returns null when the range is %s", async (_label, min, max) => {
    expect(
      await adapterFor(withCosts(min, max)).lookupPriceRange!(KIMANA_NUMBER),
    ).toBeNull();
  });

  it("refuses a number that is not a Gujarat RERA number, and a project it cannot find", async () => {
    const adapter = adapterFor(withCosts(1, 2));

    await expect(adapter.lookupPriceRange!("NOT-A-NUMBER")).rejects.toThrow(
      RegulatorError,
    );
    await expect(
      adapterFor(
        fakeSite({
          "/project_reg/public/global-search": searchResponse([]),
        }),
      ).lookupPriceRange!(KIMANA_NUMBER),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("leaves the record itself free of money even when the search hit states a range", async () => {
    const record = await adapterFor(
      withCosts(22_573_000, 66_319_200),
    ).lookupByRegistrationNumber(KIMANA_NUMBER);
    const everything = JSON.stringify(record);

    expect(everything).not.toContain("22573000");
    expect(everything).not.toContain("66319200");
  });
});
