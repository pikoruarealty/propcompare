import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/properties/http";
import { parseIntakeHandoffBody } from "@/lib/buyer/http";
import {
  INTAKE_HANDOFF_CLAIM_PATH,
  INTAKE_HANDOFF_COOKIE,
  INTAKE_HANDOFF_MAX_AGE_SECONDS,
} from "@/lib/buyer/intake-handoff";

/**
 * `POST /api/v1/buyer/intake-handoff` — sets the pre-login intake handoff
 * cookie. Called only when a buyer explicitly chooses "Sign in to keep this
 * search" on the guided-intake summary step (`IntakeFlow`) — never on every
 * answer change, and never silently; that explicit choice is what keeps this
 * consistent with the 2026-09-07 decision that a stated range is never sent
 * anywhere without the buyer choosing to.
 *
 * No session is required (the buyer is not signed in yet, which is the whole
 * point) and no database write happens here — see `POST
 * /api/v1/buyer/intake-handoff/claim` for the one write, made at login.
 * Specified in `docs/api/api-spec.v1.md`;
 * `docs/tasklists/2026-09-18-pre-login-intake-cookie.md` is the
 * implementation record.
 */
export const POST = async (request: NextRequest): Promise<Response> => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(
      422,
      "invalid_request_body",
      "Request body must be valid JSON.",
    );
  }

  const parsed = parseIntakeHandoffBody(body);
  if (!parsed.ok) {
    return errorResponse(422, parsed.code, parsed.message);
  }

  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(INTAKE_HANDOFF_COOKIE, JSON.stringify(parsed.answers), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: INTAKE_HANDOFF_CLAIM_PATH,
    maxAge: INTAKE_HANDOFF_MAX_AGE_SECONDS,
  });
  return response;
};
