import { errorResponse, internalErrorResponse } from "@/lib/properties/http";
import { ReraFetchError } from "./submission-fetch";

const STATUS: Record<ReraFetchError["code"], number> = {
  submission_not_found: 404,
  job_not_found: 404,
  invalid_state: 409,
  nothing_to_apply: 409,
  duplicate_number: 409,
  no_regulator: 422,
  invalid_number: 422,
  not_found: 422,
  ambiguous: 422,
  invalid_value: 422,
  // The regulator's site, not us or the caller, is the problem.
  unavailable: 502,
  unexpected_response: 502,
};

/** Maps a RERA fetch failure to the API error envelope; anything else is a 500. */
export const reraErrorResponse = (cause: unknown, route: string): Response =>
  cause instanceof ReraFetchError
    ? errorResponse(STATUS[cause.code], cause.code, cause.message)
    : internalErrorResponse(route, cause);
