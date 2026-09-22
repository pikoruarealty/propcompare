/**
 * The pre-login intake handoff: constants and the one database write behind
 * it. See `docs/tasklists/2026-09-18-pre-login-intake-cookie.md` for the
 * shape of the mechanism and `DECISIONS.md` (2026-09-18, 2026-09-22) for why
 * it looks like this.
 *
 * A buyer who runs guided intake before signing in states everything in
 * client state only (`IntakeFlow`, `DECISIONS.md` 2026-09-07) — nothing
 * leaves the device unless the buyer explicitly chooses "Sign in to keep
 * this search" on the summary step. That explicit choice, and only that
 * choice, calls `POST /api/v1/buyer/intake-handoff`, which sets this cookie
 * and nothing else: no database write happens yet. On successful sign-in,
 * the client calls `POST /api/v1/buyer/intake-handoff/claim`, which reads the
 * cookie, writes exactly one `buyer_intake_sessions` row now that a `userId`
 * exists, clears the cookie, and hands the claimed answers back in the
 * response so the browser can apply them to `/intake` as an editable
 * starting point — never a locked-in choice.
 */

import { eq } from "drizzle-orm";
import { bhkTypes, buyerIntakeSessions } from "@/db/schema/catalog";
import { RANGE_MAX_LAKH, type IntakeAnswers } from "@/lib/properties/intake";
import type { AppDb } from "./types";

export const INTAKE_HANDOFF_COOKIE = "pc_intake_handoff";

/**
 * The cookie's `Path` is this one route, not "the login/signup routes" the
 * 2026-09-18 direction described — narrower still, and just as effective: the
 * claim happens from a purpose-built route the browser calls once, right
 * after a successful sign-in, so the browser attaches this cookie to nothing
 * else it requests, ever.
 */
export const INTAKE_HANDOFF_CLAIM_PATH = "/api/v1/buyer/intake-handoff/claim";

/** ~30 minutes, per the 2026-09-18 direction. Nothing cleans up an unclaimed
 * cookie — there is no server-side draft to clean up, only the browser's own
 * cookie expiry. */
export const INTAKE_HANDOFF_MAX_AGE_SECONDS = 30 * 60;

const LAKH_IN_INR = 100_000;

/**
 * Writes one `buyer_intake_sessions` row for a just-authenticated buyer,
 * claiming what they stated during guided intake before signing in. Called at
 * most once per login, from the claim route — never per intake-answer change,
 * per the tasklist's non-goals.
 *
 * `budgetMaxInr` is left `null` for a range left at the open top of the scale
 * ("₹5 crore or more"), the same rule the matching endpoint uses to avoid
 * ever recording a literal ceiling the buyer never actually stated
 * (`isOpenEndedTop`, `DECISIONS.md` 2026-09-18).
 */
export const claimIntakeSession = async (
  db: AppDb,
  userId: string,
  answers: IntakeAnswers,
): Promise<void> => {
  let desiredBhkTypeId: string | null = null;
  if (answers.bhk !== null) {
    const [bhkType] = await db
      .select({ id: bhkTypes.id })
      .from(bhkTypes)
      .where(eq(bhkTypes.key, answers.bhk));
    desiredBhkTypeId = bhkType?.id ?? null;
  }

  const range = answers.statedRange;
  const isOpenEndedTop = range !== null && range.toLakh >= RANGE_MAX_LAKH;

  await db.insert(buyerIntakeSessions).values({
    userId,
    personaPriorities: answers.priorities,
    desiredBhkTypeId,
    budgetMinInr: range === null ? null : String(range.fromLakh * LAKH_IN_INR),
    budgetMaxInr:
      range === null || isOpenEndedTop
        ? null
        : String(range.toLakh * LAKH_IN_INR),
    city: answers.city,
  });
};
