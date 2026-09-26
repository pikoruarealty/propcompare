import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: { marker: "catalog" } }));
vi.mock("@/db/developer-reader", () => ({
  developerReaderDb: { marker: "reader" },
}));
vi.mock("@/lib/accounts/api-session", () => ({
  requireDeveloperRequest: vi.fn(),
}));
vi.mock("@/lib/developers/analytics/report", () => ({
  getPortfolioReport: vi.fn(),
  getPropertyReport: vi.fn(),
  getExportRows: vi.fn(),
  listOwnProperties: vi.fn(),
}));

const { requireDeveloperRequest } = await import("@/lib/accounts/api-session");
const {
  getPortfolioReport,
  getPropertyReport,
  getExportRows,
  listOwnProperties,
} = await import("@/lib/developers/analytics/report");
const portfolio = await import("./portfolio/route");
const property = await import("./properties/[id]/route");
const exportRoute = await import("./export/route");

const OWN = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PROPERTY = "11111111-1111-1111-1111-111111111111";
const session = { userId: "u1", developerId: OWN };

const get = (path: string) => new NextRequest(`http://localhost${path}`);
const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

const calls: [string, () => Promise<Response>][] = [
  ["portfolio", () => portfolio.GET(get("/api/v1/developer/portfolio"))],
  [
    "property",
    () =>
      property.GET(
        get(`/api/v1/developer/properties/${PROPERTY}`),
        ctx(PROPERTY),
      ),
  ],
  ["export", () => exportRoute.GET(get("/api/v1/developer/export"))],
];

const emptyReport = {
  meta: null,
  portfolio: {
    visitors: { released: false, value: null },
    visits: { released: false, value: null },
    returningVisitors: { released: false, value: null },
  },
  properties: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("developer analytics routes: access", () => {
  it.each(calls)("%s needs a session", async (_name, call) => {
    vi.mocked(requireDeveloperRequest).mockResolvedValue("unauthenticated");
    const response = await call();
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it.each(calls)(
    "%s refuses a signed-in non-developer",
    async (_name, call) => {
      vi.mocked(requireDeveloperRequest).mockResolvedValue("forbidden");
      expect((await call()).status).toBe(403);
      expect(getPortfolioReport).not.toHaveBeenCalled();
      expect(getPropertyReport).not.toHaveBeenCalled();
      expect(getExportRows).not.toHaveBeenCalled();
    },
  );
});

describe("developer analytics routes: behaviour", () => {
  beforeEach(() =>
    vi.mocked(requireDeveloperRequest).mockResolvedValue(session),
  );

  it("reads the portfolio for the session's developer and never caches it", async () => {
    vi.mocked(getPortfolioReport).mockResolvedValue(emptyReport as never);
    const response = await portfolio.GET(
      get("/api/v1/developer/portfolio?window=7d"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(getPortfolioReport).toHaveBeenCalledWith(
      { reader: { marker: "reader" }, catalog: { marker: "catalog" } },
      OWN,
      "7d",
    );
  });

  it("takes no developer id, custom range or unknown window from the caller", async () => {
    for (const qs of [
      `developerId=${PROPERTY}`,
      "from=2026-01-01",
      "window=90d",
    ]) {
      const response = await portfolio.GET(
        get(`/api/v1/developer/portfolio?${qs}`),
      );
      expect(response.status).toBe(422);
    }
    expect(getPortfolioReport).not.toHaveBeenCalled();
  });

  it("answers 404 for a property that is not the developer's own", async () => {
    vi.mocked(getPropertyReport).mockResolvedValue(null);
    const response = await property.GET(
      get(`/api/v1/developer/properties/${PROPERTY}`),
      ctx(PROPERTY),
    );
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("property_not_found");
    expect(getPropertyReport).toHaveBeenCalledWith(
      expect.anything(),
      OWN,
      PROPERTY,
      "30d",
    );
  });

  it("reports an unexpected failure without its detail", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(getPortfolioReport).mockRejectedValue(
      new Error("connection to 10.0.0.5 refused"),
    );
    const response = await portfolio.GET(get("/api/v1/developer/portfolio"));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("10.0.0.5");
  });
});

describe("developer analytics export", () => {
  beforeEach(() =>
    vi.mocked(requireDeveloperRequest).mockResolvedValue(session),
  );

  const meta = { window: { end: "2026-09-25" } };

  it("writes a CSV that neutralises a formula and states withheld figures", async () => {
    vi.mocked(getExportRows).mockResolvedValue({
      ok: true,
      meta: meta as never,
      rows: [
        {
          property: "=cmd|' /C calc'!A0",
          figure: "Visitors",
          unit: "people",
          split: "",
          splitValue: "",
          status: "released",
          value: 12,
        },
        {
          property: "Tower B",
          figure: "Savers",
          unit: "people",
          split: "",
          splitValue: "",
          status: "not enough data",
          value: null,
        },
      ],
    });
    const response = await exportRoute.GET(
      get("/api/v1/developer/export?window=ytd"),
    );
    expect(response.headers.get("Content-Type")).toBe(
      "text/csv; charset=utf-8",
    );
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="propcompare-analytics-ytd.csv"',
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const lines = (await response.text()).trimEnd().split("\r\n");
    expect(lines[0]).toBe(
      "window,data_through,property,figure,unit,split,split_value,status,value",
    );
    expect(lines[1]).toBe(
      `ytd,2026-09-25,'=cmd|' /C calc'!A0,Visitors,people,,,released,12`,
    );
    expect(lines[2]).toBe(
      "ytd,2026-09-25,Tower B,Savers,people,,,not enough data,",
    );
  });

  it("exports one property only if it is the developer's own", async () => {
    vi.mocked(listOwnProperties).mockResolvedValue([]);
    const response = await exportRoute.GET(
      get(`/api/v1/developer/export?property=${PROPERTY}`),
    );
    expect(response.status).toBe(404);
    expect(getExportRows).not.toHaveBeenCalled();
  });

  it("passes an own property through", async () => {
    vi.mocked(listOwnProperties).mockResolvedValue([
      { id: PROPERTY, slug: "s", name: "N", city: "c", locality: "l" },
    ]);
    vi.mocked(getExportRows).mockResolvedValue({
      ok: true,
      meta: null,
      rows: [],
    });
    const response = await exportRoute.GET(
      get(`/api/v1/developer/export?property=${PROPERTY}`),
    );
    expect(response.status).toBe(200);
    expect(getExportRows).toHaveBeenCalledWith(
      expect.anything(),
      OWN,
      "30d",
      PROPERTY,
    );
  });

  it("asks for a narrower export when it is over the row cap", async () => {
    vi.mocked(getExportRows).mockResolvedValue({
      ok: false,
      reason: "too_large",
    });
    const response = await exportRoute.GET(get("/api/v1/developer/export"));
    expect(response.status).toBe(422);
  });
});
