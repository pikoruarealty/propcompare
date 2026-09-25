import type { NextRequest } from "next/server";
import { db } from "@/db";
import { requireAdminRequest } from "@/lib/accounts/api-session";
import { getPricingDb } from "@/lib/pricing/db";
import {
  PricesError,
  getPricesState,
  stagePrice,
  unstagePrice,
} from "@/lib/pricing/panel";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";

/**
 * The review panel's Prices tab (`DECISIONS.md` 2026-09-24, "price data"). Owner
 * only, because a price is commercial data: a reviewer checks facts, an owner sees
 * and enters what the business holds privately. Nothing here is ever shown to a
 * buyer, and every response is `no-store`.
 *
 * - `GET`: the unit types, what has been typed, the live prices and RERA's range.
 * - `PUT { unitVariantName, priceInr }`: types (or replaces) one unit type's price.
 * - `DELETE { unitVariantName }`: removes a typed price that is not yet published.
 *
 * A typed price is held privately and becomes a live price when the submission is
 * published.
 */

const NO_STORE = { "Cache-Control": "no-store" };

const guard = async (request: NextRequest) => {
  const session = await requireAdminRequest(request);
  if (session === "unauthenticated") {
    return errorResponse(401, "unauthenticated", "A session is required.");
  }
  if (session === "forbidden" || session.permissionLevel !== "owner") {
    return errorResponse(403, "forbidden", "Only an owner can see prices.");
  }
  return session;
};

const failure = (cause: unknown, route: string): Response => {
  if (cause instanceof PricesError) {
    const status =
      cause.code === "submission_not_found"
        ? 404
        : cause.code === "invalid_state"
          ? 409
          : 422;
    return errorResponse(
      status,
      cause.code === "invalid_price" || cause.code === "unknown_unit_type"
        ? "invalid_request_body"
        : cause.code,
      cause.message,
    );
  }
  return internalErrorResponse(route, cause);
};

const unavailable = () =>
  errorResponse(
    503,
    "invalid_state",
    "The private price store is not configured on this server.",
  );

export const GET = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/admin/submissions/[id]/prices">,
): Promise<Response> => {
  const session = await guard(request);
  if (session instanceof Response) return session;
  const { id } = await context.params;
  try {
    return Response.json(await getPricesState(db, await getPricingDb(), id), {
      headers: NO_STORE,
    });
  } catch (cause) {
    return failure(cause, "GET /api/v1/admin/submissions/[id]/prices");
  }
};

const readBody = async (request: NextRequest) =>
  (await request.json().catch(() => null)) as {
    unitVariantName?: unknown;
    priceInr?: unknown;
  } | null;

export const PUT = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/admin/submissions/[id]/prices">,
): Promise<Response> => {
  const session = await guard(request);
  if (session instanceof Response) return session;
  const body = await readBody(request);
  if (
    typeof body?.unitVariantName !== "string" ||
    !body.unitVariantName.trim()
  ) {
    return errorResponse(
      422,
      "invalid_request_body",
      "unitVariantName is required.",
    );
  }
  const pricing = await getPricingDb();
  if (!pricing) return unavailable();
  const { id } = await context.params;
  try {
    await stagePrice(db, pricing, {
      submissionId: id,
      unitVariantName: body.unitVariantName,
      priceInr: body.priceInr,
      enteredBy: session.userId,
    });
    return Response.json(await getPricesState(db, pricing, id), {
      headers: NO_STORE,
    });
  } catch (cause) {
    return failure(cause, "PUT /api/v1/admin/submissions/[id]/prices");
  }
};

export const DELETE = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/admin/submissions/[id]/prices">,
): Promise<Response> => {
  const session = await guard(request);
  if (session instanceof Response) return session;
  const body = await readBody(request);
  if (
    typeof body?.unitVariantName !== "string" ||
    !body.unitVariantName.trim()
  ) {
    return errorResponse(
      422,
      "invalid_request_body",
      "unitVariantName is required.",
    );
  }
  const pricing = await getPricingDb();
  if (!pricing) return unavailable();
  const { id } = await context.params;
  try {
    await unstagePrice(db, pricing, {
      submissionId: id,
      unitVariantName: body.unitVariantName,
    });
    return Response.json(await getPricesState(db, pricing, id), {
      headers: NO_STORE,
    });
  } catch (cause) {
    return failure(cause, "DELETE /api/v1/admin/submissions/[id]/prices");
  }
};
