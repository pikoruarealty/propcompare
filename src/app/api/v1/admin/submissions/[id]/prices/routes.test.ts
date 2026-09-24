import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/accounts/api-session", () => ({
  requireAdminRequest: vi.fn(),
}));
vi.mock("@/lib/pricing/db", () => ({ getPricingDb: vi.fn() }));
vi.mock("@/lib/pricing/panel", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pricing/panel")>(
    "@/lib/pricing/panel",
  );
  return {
    ...actual,
    getPricesState: vi.fn(),
    stagePrice: vi.fn(),
    unstagePrice: vi.fn(),
    retryApplyPrices: vi.fn(),
  };
});

const { requireAdminRequest } = await import("@/lib/accounts/api-session");
const { getPricingDb } = await import("@/lib/pricing/db");
const {
  PricesError,
  getPricesState,
  stagePrice,
  unstagePrice,
  retryApplyPrices,
} = await import("@/lib/pricing/panel");
const route = await import("./route");
const applyRoute = await import("./apply/route");

const ID = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ id: ID }) };
const request = (method: string, body?: unknown, path = "prices") =>
  new NextRequest(`http://localhost/api/v1/admin/submissions/${ID}/${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const session = (permissionLevel: "owner" | "verifier") =>
  ({ userId: "u1", permissionLevel }) as unknown as Awaited<
    ReturnType<typeof requireAdminRequest>
  >;
const fakePricingDb = {} as never;
const state = { unitTypes: [], unavailable: false } as never;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireAdminRequest).mockResolvedValue(session("owner"));
  vi.mocked(getPricingDb).mockResolvedValue(fakePricingDb);
  vi.mocked(getPricesState).mockResolvedValue(state);
});

const handlers = [
  ["GET", () => route.GET(request("GET"), context as never)],
  [
    "PUT",
    () =>
      route.PUT(
        request("PUT", { unitVariantName: "Type A", priceInr: "1" }),
        context as never,
      ),
  ],
  [
    "DELETE",
    () =>
      route.DELETE(
        request("DELETE", { unitVariantName: "Type A" }),
        context as never,
      ),
  ],
  [
    "POST apply",
    () =>
      applyRoute.POST(
        request("POST", undefined, "prices/apply"),
        context as never,
      ),
  ],
] as const;

describe("the prices routes are for owners only", () => {
  it.each(handlers)("%s: 401 with no session", async (_name, call) => {
    vi.mocked(requireAdminRequest).mockResolvedValue("unauthenticated");
    expect((await call()).status).toBe(401);
  });

  it.each(handlers)("%s: 403 for a non-admin", async (_name, call) => {
    vi.mocked(requireAdminRequest).mockResolvedValue("forbidden");
    expect((await call()).status).toBe(403);
  });

  it.each(handlers)("%s: 403 for a verifier", async (_name, call) => {
    vi.mocked(requireAdminRequest).mockResolvedValue(session("verifier"));
    expect((await call()).status).toBe(403);
    expect(stagePrice).not.toHaveBeenCalled();
    expect(unstagePrice).not.toHaveBeenCalled();
    expect(retryApplyPrices).not.toHaveBeenCalled();
    expect(getPricesState).not.toHaveBeenCalled();
  });
});

describe("GET …/prices", () => {
  it("answers the panel state, never cached", async () => {
    const response = await route.GET(request("GET"), context as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(getPricesState).toHaveBeenCalledWith({}, fakePricingDb, ID);
  });

  it("still answers, as unavailable, when the private store is not configured", async () => {
    vi.mocked(getPricingDb).mockResolvedValue(null);

    await route.GET(request("GET"), context as never);

    expect(getPricesState).toHaveBeenCalledWith({}, null, ID);
  });

  it("answers 404 for an unknown submission", async () => {
    vi.mocked(getPricesState).mockRejectedValue(
      new PricesError("submission_not_found", "Submission not found."),
    );

    expect((await route.GET(request("GET"), context as never)).status).toBe(
      404,
    );
  });
});

describe("PUT …/prices", () => {
  it("stages the price as the signed-in owner and answers the new state", async () => {
    const response = await route.PUT(
      request("PUT", { unitVariantName: "Type A", priceInr: "25000000" }),
      context as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(stagePrice).toHaveBeenCalledWith({}, fakePricingDb, {
      submissionId: ID,
      unitVariantName: "Type A",
      priceInr: "25000000",
      enteredBy: "u1",
    });
  });

  it.each([[{}], [{ unitVariantName: "  " }], [null]])(
    "422 without a unit type name (%j)",
    async (body) => {
      const response = await route.PUT(
        request("PUT", body ?? undefined),
        context as never,
      );

      expect(response.status).toBe(422);
      expect(stagePrice).not.toHaveBeenCalled();
    },
  );

  it("answers 503 when the private store is not configured", async () => {
    vi.mocked(getPricingDb).mockResolvedValue(null);

    const response = await route.PUT(
      request("PUT", { unitVariantName: "Type A", priceInr: "1" }),
      context as never,
    );

    expect(response.status).toBe(503);
    expect(stagePrice).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid_price", 422, "invalid_request_body"],
    ["unknown_unit_type", 422, "invalid_request_body"],
    ["invalid_state", 409, "invalid_state"],
    ["submission_not_found", 404, "submission_not_found"],
  ] as const)("maps %s to %s", async (code, status, apiCode) => {
    vi.mocked(stagePrice).mockRejectedValue(new PricesError(code, "No."));

    const response = await route.PUT(
      request("PUT", { unitVariantName: "Type A", priceInr: "1" }),
      context as never,
    );

    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(apiCode);
  });
});

describe("DELETE …/prices", () => {
  it("clears a typed price and answers the new state", async () => {
    const response = await route.DELETE(
      request("DELETE", { unitVariantName: "Type A" }),
      context as never,
    );

    expect(response.status).toBe(200);
    expect(unstagePrice).toHaveBeenCalledWith({}, fakePricingDb, {
      submissionId: ID,
      unitVariantName: "Type A",
    });
  });
});

describe("POST …/prices/apply", () => {
  it("applies the staged prices and says what happened", async () => {
    vi.mocked(retryApplyPrices).mockResolvedValue({
      applied: ["Type A"],
      unchanged: [],
      unknown: [],
    });

    const response = await applyRoute.POST(
      request("POST", undefined, "prices/apply"),
      context as never,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      applied: ["Type A"],
      unchanged: [],
      unknown: [],
    });
  });

  it("answers 409 for a submission that is not published, and 503 with no store", async () => {
    vi.mocked(retryApplyPrices).mockRejectedValue(
      new PricesError("invalid_state", "Prices are applied when published."),
    );
    expect(
      (
        await applyRoute.POST(
          request("POST", undefined, "prices/apply"),
          context as never,
        )
      ).status,
    ).toBe(409);

    vi.mocked(getPricingDb).mockResolvedValue(null);
    expect(
      (
        await applyRoute.POST(
          request("POST", undefined, "prices/apply"),
          context as never,
        )
      ).status,
    ).toBe(503);
  });
});
