import type { IntakeAnswers } from "./intake";

/**
 * A one-shot, in-memory (never storage, never a cookie) handoff from
 * `BuyerLoginForm` to `IntakeFlow` across the client-side navigation from
 * `/login` back to `/intake` right after a sign-in that claimed a kept search
 * (`POST /api/v1/buyer/intake-handoff/claim`).
 *
 * Deliberately not `sessionStorage` or any other persistence: this is a
 * same-tab, same-page-load relay for one navigation, not a mechanism meant to
 * survive a reload or be readable outside this one moment. A reload of
 * `/intake` after this is consumed starts blank, exactly like any other
 * visit — see `docs/tasklists/2026-09-18-pre-login-intake-cookie.md`'s
 * non-goal: "not a general session/preferences mechanism."
 */
let pending: IntakeAnswers | null = null;

export const setPendingIntakeClaim = (answers: IntakeAnswers): void => {
  pending = answers;
};

/** Reads and clears in one step, so it can only ever be applied once. */
export const consumePendingIntakeClaim = (): IntakeAnswers | null => {
  const value = pending;
  pending = null;
  return value;
};
