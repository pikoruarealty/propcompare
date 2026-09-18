/**
 * The bridge between the guided intake answers and
 * `POST /api/v1/discovery/matches` — the arithmetic, the request body, and the
 * words the flow uses to describe what it searched.
 *
 * **Why this is a separate module from `./intake.ts`.** The endpoint's contract
 * names its bounds `minInr` and `maxInr`, and `./no-price.ts` matches `/inr/i`
 * and runs in production. The 2026-09-07 decision deliberately kept those names
 * out of the client answer shape, and a test asserts `IntakeAnswers` still
 * passes `findForbiddenKeys`. Keeping the conversion here means the `Inr` names
 * exist in exactly one place — an outbound request body, which is the one place
 * the contract requires them — rather than spreading back into the module that
 * describes what the buyer said.
 *
 * **Why the screen calls the HTTP route at all.** The 2026-09-07 browse-page
 * decision has a Server Component call the read layer directly rather than
 * fetch its own API. That reasoning does not reach this case: the stated range
 * lives in client state and must never travel as anything but a request body,
 * so there is no server render that could hold it. See DECISIONS.md
 * (2026-09-18).
 *
 * Nothing here persists anything. The body is built, sent, and discarded.
 */

import type { PropertyListResult } from "./types";
import { DEFAULT_PAGE_SIZE } from "./types";
import {
  type IntakeAnswers,
  RANGE_MAX_LAKH,
  type StatedRange,
  formatStatedFigure,
} from "./intake";

export const MATCHES_ENDPOINT = "/api/v1/discovery/matches";

const LAKH_IN_INR = 100_000;

/**
 * The expansion the matcher applies, mirrored here for one purpose only: to
 * tell the buyer the span that was actually searched. It is not used to compute
 * anything sent to the server — the server owns the expansion, and duplicating
 * it as a computation rather than a description would be a second definition of
 * the ±20% rule (DECISIONS.md 2026-09-01).
 */
const TOLERANCE = 0.2;

/**
 * The request body, named exactly as the contract names it, and carrying its
 * discriminated upper end: a stated `maxInr`, or `maxUnbounded: true` for a
 * buyer who left the top of the scale open. The two are mutually exclusive and
 * one is required — omitting `maxInr` without the flag is a `422`, not a
 * silently wide search.
 *
 * This is the only shape in the client that carries `Inr` keys, and it exists
 * for the length of one `fetch`.
 */
export type MatchRequestBody = {
  minInr: number;
  city?: string;
  bhk?: string;
  page: number;
  pageSize: number;
} & ({ maxInr: number } | { maxUnbounded: true });

const toInr = (lakh: number): number => lakh * LAKH_IN_INR;

/**
 * True when the buyer left the upper handle at the top of the scale, where the
 * control reads "₹5 crore or more" (2026-09-07).
 *
 * It now has a real encoding. `maxUnbounded: true` tells the matcher to resolve
 * the ceiling against the catalog's highest current price inside Postgres, so
 * the figure never exists as a value the client could be told (DECISIONS.md
 * 2026-09-18). Between this slice shipping and that contract landing, the
 * stated ₹5 crore was sent and the resulting cap was disclosed; that interim is
 * gone, and with it the ceiling it had to apologise for.
 */
export const isOpenEndedTop = (range: StatedRange): boolean =>
  range.toLakh >= RANGE_MAX_LAKH;

/**
 * The body for a buyer's answers, or `null` when no range was stated.
 *
 * `null` is not a failure — it is the honest answer that this endpoint has
 * nothing to match on. A lower bound is always required, and inventing a
 * default range on the buyer's behalf would be putting a figure in their mouth,
 * so the flow keeps its existing `/properties` hand-off for that case.
 *
 * A range left at the top of the scale sends `maxUnbounded: true` rather than
 * the ₹5 crore the handle happens to sit on, so "or more" reaches the matcher
 * as the open end the buyer actually stated.
 *
 * The carried fields are named one at a time rather than spread, for the same
 * reason `handoffParams` is: a future answer field must not reach the wire
 * because someone edited this function without thinking about what it sends.
 */
export const matchRequestBody = (
  answers: IntakeAnswers,
  page = 1,
): MatchRequestBody | null => {
  const range = answers.statedRange;
  if (range === null) return null;

  const body: MatchRequestBody = {
    minInr: toInr(range.fromLakh),
    ...(isOpenEndedTop(range)
      ? { maxUnbounded: true as const }
      : { maxInr: toInr(range.toLakh) }),
    page,
    pageSize: DEFAULT_PAGE_SIZE,
  };

  if (answers.city !== null) body.city = answers.city;
  if (answers.bhk !== null) body.bhk = answers.bhk;

  return body;
};

/**
 * The span the matcher actually covered, in the buyer's own units — "₹40 lakh
 * to ₹1.8 crore" for a stated ₹50 lakh–₹1.5 crore.
 *
 * Shown rather than hidden because a buyer who states ₹50 lakh and sees a
 * result they read as dearer will otherwise conclude the filter is broken. The
 * ±20% expansion is a deliberate product rule, and a rule the buyer cannot see
 * is indistinguishable from a bug.
 *
 * An open top end has no upper figure to name, and naming one would be exactly
 * the ceiling the contract now avoids. It gets no `to`, and no `+20%` either:
 * the matcher resolves the open end against the catalog's true maximum, which
 * nothing is priced above by definition, so there is nothing for an expansion
 * to reach.
 */
export const describeSearchedSpan = (range: StatedRange): string => {
  const from = formatStatedFigure(range.fromLakh * (1 - TOLERANCE));
  return isOpenEndedTop(range)
    ? `${from} and upwards`
    : `${from} to ${formatStatedFigure(range.toLakh * (1 + TOLERANCE))}`;
};

/* -------------------------------------------------------------------------- */
/* The request                                                                 */
/* -------------------------------------------------------------------------- */

export type MatchOutcome =
  { ok: true; result: PropertyListResult } | { ok: false; message: string };

/**
 * The failure text a buyer reads. The endpoint's `message` is developer-facing
 * prose naming an offending field (2026-09-02), so it is deliberately not
 * surfaced — but the distinction between the two failure classes is, because
 * "nothing matched" and "the request was wrong" are different facts and a
 * screen that renders the second as the first tells the buyer the catalog is
 * empty when it is not.
 */
const REJECTED_MESSAGE =
  "That search could not be run. Your answers are still here — go back and change one, or browse the whole catalog.";

const UNREACHABLE_MESSAGE =
  "Your matches could not be loaded just now. Nothing you entered has been lost — try again, or browse the whole catalog.";

/**
 * Posts the body and returns either the result or a message. It never throws:
 * a network failure and a rejected request are both ordinary outcomes this
 * screen has a state for, and an unhandled rejection in a client component
 * would take the flow — and every answer in it — down with it.
 */
export const requestMatches = async (
  body: MatchRequestBody,
  signal?: AbortSignal,
): Promise<MatchOutcome> => {
  let response: Response;

  try {
    response = await fetch(MATCHES_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    return { ok: false, message: UNREACHABLE_MESSAGE };
  }

  if (!response.ok) {
    return {
      ok: false,
      message: response.status === 422 ? REJECTED_MESSAGE : UNREACHABLE_MESSAGE,
    };
  }

  try {
    return { ok: true, result: (await response.json()) as PropertyListResult };
  } catch {
    return { ok: false, message: UNREACHABLE_MESSAGE };
  }
};
