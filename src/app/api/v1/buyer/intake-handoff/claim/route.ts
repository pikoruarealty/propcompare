import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";
import { assertNoExcludedData } from "@/lib/properties/no-price";
import { requireBuyerSession } from "@/lib/buyer/session";
import { parseIntakeHandoffBody } from "@/lib/buyer/http";
import {
  claimIntakeSession,
  INTAKE_HANDOFF_CLAIM_PATH,
  INTAKE_HANDOFF_COOKIE,
} from "@/lib/buyer/intake-handoff";
import type { IntakeAnswers } from "@/lib/properties/intake";

/**
 * `POST /api/v1/buyer/intake-handoff/claim` — claims the pre-login intake
 * handoff cookie into one `buyer_intake_sessions` row, at most once per
 * login. Called by the client right after a successful sign-in
 * (`BuyerLoginForm`), before it navigates the buyer back to where they came
 * from.
 *
 * Requires a session — the whole point of this route is that one now exists.
 * A missing or invalid cookie is not a failure: `{ "data": null }` is the
 * honest answer that there was nothing to claim, which covers a buyer who
 * signed in without ever choosing to keep a search, an expired cookie, and a
 * cookie a client sent tampered with. The claimed answers are handed back in
 * the response so the browser can apply them to `/intake` as an editable
 * starting point for this one navigation — this route itself never reads
 * `buyer_intake_sessions` back, on this or any later request.
 */
export const POST = async (request: NextRequest): Promise<Response> => {
  const session = await requireBuyerSession(request);
  if (!session) {
    return errorResponse(401, "unauthenticated", "A session is required.");
  }

  const raw = request.cookies.get(INTAKE_HANDOFF_COOKIE)?.value;
  let answers: IntakeAnswers | null = null;
  if (raw !== undefined) {
    try {
      const parsed = parseIntakeHandoffBody(JSON.parse(raw));
      if (parsed.ok) answers = parsed.answers;
    } catch {
      // Malformed cookie: nothing to claim, not a failed sign-in.
    }
  }

  try {
    if (answers !== null) {
      await claimIntakeSession(db, session.userId, answers);
    }
  } catch (cause) {
    return internalErrorResponse(
      "POST /api/v1/buyer/intake-handoff/claim",
      cause,
    );
  }

  const response = NextResponse.json(assertNoExcludedData({ data: answers }), {
    headers: { "Cache-Control": "no-store" },
  });
  // Cleared unconditionally, whether or not there was anything to claim, so a
  // cookie that failed validation cannot be resubmitted.
  response.cookies.set(INTAKE_HANDOFF_COOKIE, "", {
    path: INTAKE_HANDOFF_CLAIM_PATH,
    maxAge: 0,
  });
  return response;
};
