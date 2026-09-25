"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { INTAKE_PRIORITIES_KEY } from "@/lib/compare/focus";
import { budgetBandOf } from "@/lib/analytics/events";
import { rememberBudgetBand, trackEvent } from "@/lib/analytics/track";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { BROWSE_PATH, FILTER_LABEL } from "@/lib/properties/browse";
import type { FilterOptions } from "@/lib/properties/filter-options";
import {
  matchRequestBody,
  requestMatches,
} from "@/lib/properties/intake-matches";
import { consumePendingIntakeClaim } from "@/lib/properties/pending-intake-claim";
import {
  DEFAULT_STATED_RANGE,
  EMPTY_ANSWERS,
  INTAKE_PATH,
  INTAKE_STEPS,
  type IntakeAnswers,
  MAX_PRIORITIES,
  PRIORITY_OPTIONS,
  QUESTION_STEP_COUNT,
  describePriorities,
  formatStatedRange,
  handoffHref,
  handoffParams,
  hasAnyAnswer,
  togglePriority,
} from "@/lib/properties/intake";
import { IntakeMatchResults, type MatchViewState } from "./intake-matches";
import { StatedRangeSlider } from "./stated-range-slider";
import { BodyText, DisplayHeading, Eyebrow } from "./typography";

/**
 * The guided intake flow — **the only client component in the buyer surface.**
 *
 * Everything else built this phase is a Server Component, and the browse screen
 * deliberately keeps its filter state in the URL so a filtered view is a real,
 * shareable address. That pattern is not copied here, on purpose: this flow
 * captures a range the buyer states about their own finances, and a query
 * string lands in browser history, in server access logs, and in the `Referer`
 * header of every request the page goes on to make. `useState` keeps every
 * answer on the device and out of all three. Recorded in DECISIONS.md
 * (2026-09-07).
 *
 * Nothing here is persisted by default. `POST /api/v1/intake-sessions` is not
 * built and will not be. The one exception is explicit and opt-in: on the
 * summary step, a buyer who is not signed in and has stated anything sees
 * "Sign in to keep this search" — choosing it, and only choosing it, posts
 * the current answers to `POST /api/v1/buyer/intake-handoff`, which sets a
 * narrowly-scoped cookie (never a database write on its own). On sign-in,
 * `BuyerLoginForm` claims it into one `buyer_intake_sessions` row and hands
 * the answers back; this component then reapplies them here as an editable
 * starting point (never locked in), via a one-shot in-memory handoff
 * (`consumePendingIntakeClaim`). See DECISIONS.md 2026-09-18 and 2026-09-22,
 * and `docs/tasklists/2026-09-18-pre-login-intake-cookie.md`.
 *
 * The flow now has two endings, and which one the buyer gets depends on whether
 * they stated a range:
 *
 * - **They did.** The summary's action POSTs the range, with the city and
 *   configuration, to `POST /api/v1/discovery/matches` and renders the matched
 *   properties in place. The request is transmitted but never stored: the
 *   endpoint is stateless by decision (2026-09-18), the range travels in a body
 *   rather than a URL, and no result is kept after the answers change.
 * - **They did not.** The endpoint requires both bounds, so there is no match to
 *   run, and the original hand-off stands: `/properties` carrying only the two
 *   answers that map to filters the read contract has. `handoffParams` is
 *   written so the range cannot join that link by accident.
 *
 * Results render here rather than at their own address because the range has
 * nowhere else it may travel — not a URL, not `sessionStorage`, and not yet a
 * cookie. See DECISIONS.md (2026-09-18).
 *
 * Every question is optional, per the buyer flow's "intake is optional": there
 * is no validation, no required answer, and a standing exit to the unfiltered
 * catalog on every step.
 */

const CARD_CLASS = "border-border bg-card rounded-lg border p-6";

const CHOICE_CLASS =
  "border-border hover:border-[var(--color-terracotta)] has-checked:border-[var(--color-terracotta)] has-checked:bg-accent flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors has-disabled:cursor-not-allowed has-disabled:opacity-50";

const CONTROL_CLASS =
  "accent-[var(--color-terracotta)] border-input mt-0.5 size-4 shrink-0";

/** One radio choice for a single-answer question. */
function Choice({
  name,
  value,
  label,
  checked,
  onSelect,
}: {
  name: string;
  value: string;
  label: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <label className={CHOICE_CLASS}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onSelect}
        className={`${CONTROL_CLASS} rounded-full`}
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}

/**
 * A single-answer question built from a published vocabulary, with an explicit
 * "no preference" that sets the answer back to absent. An unanswered question
 * has to be reachable again after it has been answered — otherwise "optional"
 * only holds until the buyer touches the control once.
 */
function ChoiceQuestion({
  name,
  emptyMessage,
  options,
  value,
  onChange,
}: {
  name: string;
  emptyMessage: string;
  options: readonly { key: string; label: string }[];
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  if (options.length === 0) {
    return (
      <BodyText className="text-muted-foreground text-sm">
        {emptyMessage}
      </BodyText>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label={name}
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
    >
      <Choice
        name={name}
        value=""
        label="No preference"
        checked={value === null}
        onSelect={() => onChange(null)}
      />
      {options.map((option) => (
        <Choice
          key={option.key}
          name={name}
          value={option.key}
          label={option.label}
          checked={value === option.key}
          onSelect={() => onChange(option.key)}
        />
      ))}
    </div>
  );
}

/** One row of the closing brief. */
function BriefRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      data-slot="brief-row"
      className="border-border flex flex-col gap-1 border-b py-3 last:border-b-0 sm:flex-row sm:gap-6"
    >
      <dt className="text-muted-foreground w-56 shrink-0 text-sm">{label}</dt>
      <dd className="text-foreground text-sm">{value}</dd>
    </div>
  );
}

export interface IntakeFlowProps {
  options: FilterOptions;
}

export function IntakeFlow({ options }: IntakeFlowProps) {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const signedIn = Boolean(session);

  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<IntakeAnswers>(EMPTY_ANSWERS);
  const [match, setMatch] = useState<MatchViewState>({ status: "idle" });
  /** True for one render after a claimed pre-login search is reapplied. */
  const [hydratedFromClaim, setHydratedFromClaim] = useState(false);
  const [savingSearch, setSavingSearch] = useState(false);
  const claimedOnce = useRef(false);

  /**
   * The in-flight request, so a superseded one can be abandoned. Without this,
   * a slow first response can land after a faster second and overwrite the
   * newer results with older ones — which on this screen means showing the
   * buyer matches for a brief they have already changed.
   */
  const inFlight = useRef<AbortController | null>(null);

  const abandonRequest = useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
  }, []);

  // A component unmounted mid-request should not leave one running.
  useEffect(() => abandonRequest, [abandonRequest]);

  // Leave the priorities (never the stated range) in this tab for the comparison
  // page to start its focus chips from.
  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        INTAKE_PRIORITIES_KEY,
        JSON.stringify(answers.priorities),
      );
    } catch {
      // No storage: the comparison simply starts with no chips chosen.
    }
  }, [answers.priorities]);

  const step = INTAKE_STEPS[stepIndex];
  const isSummary = step.id === "summary";

  /**
   * Any answer change discards the results. They describe the brief that
   * produced them, and a grid left standing beside an edited brief is a claim
   * about a search that was never run.
   */
  const update = (patch: Partial<IntakeAnswers>) => {
    abandonRequest();
    setMatch({ status: "idle" });
    setHydratedFromClaim(false);
    setAnswers((current) => ({ ...current, ...patch }));
  };

  const restart = () => {
    abandonRequest();
    setMatch({ status: "idle" });
    setHydratedFromClaim(false);
    setAnswers(EMPTY_ANSWERS);
    setStepIndex(0);
  };

  /**
   * `answersOverride` exists for the claim-hydration effect below: it fires
   * once, right after `setAnswers`, and a `setState` result is not readable
   * from the same tick, so it cannot rely on the `answers` closure yet.
   */
  const runMatch = async (page: number, answersOverride?: IntakeAnswers) => {
    const body = matchRequestBody(answersOverride ?? answers, page);
    // Unreachable from the UI — the action only renders with a stated range —
    // but the type says this can be null, and a thrown assertion here would
    // take the buyer's answers down with it.
    if (body === null) return;

    // Analytics (`DECISIONS.md` 2026-09-25): a coarse band of the stated ceiling,
    // never the figure, remembered so later events can be read by budget band.
    if (page === 1) {
      const given = answersOverride ?? answers;
      if (given.statedRange) {
        rememberBudgetBand(budgetBandOf(given.statedRange.toLakh));
      }
      trackEvent("intake_completed", {
        detail: {
          priorities: given.priorities,
          bhk: given.bhk,
          city: given.city,
        },
      });
    }

    abandonRequest();
    const controller = new AbortController();
    inFlight.current = controller;
    setMatch({ status: "loading" });

    const outcome = await requestMatches(body, controller.signal);

    // A request the buyer superseded must not paint anything, including its
    // failure state — aborting rejects the fetch, which reads as a failure.
    if (controller.signal.aborted) return;
    inFlight.current = null;

    setMatch(
      outcome.ok
        ? { status: "ready", result: outcome.result }
        : { status: "failed", message: outcome.message },
    );
  };

  /**
   * Consumes the one-shot in-memory claim handoff, once, on mount. Guarded by
   * a ref rather than left to run only from an empty dependency array,
   * because `consumePendingIntakeClaim` clears what it reads — a second call
   * (development Strict Mode double-invokes effects) would read `null` and
   * silently discard a real claim if this only relied on `[]`.
   *
   * This has to be an effect rather than a `useState` lazy initializer: a
   * lazy initializer would also run during this client component's server
   * render, and the module-level relay it reads (`pending-intake-claim.ts`)
   * is a real browser-only value set by `BuyerLoginForm` after a `fetch` —
   * reading it on the server would read nothing and defeat the point.
   */
  /* eslint-disable react-hooks/set-state-in-effect -- synchronising a
     one-shot external (browser-only, module-level) handoff on mount, not
     derived render state. */
  useEffect(() => {
    if (claimedOnce.current) return;
    claimedOnce.current = true;
    const claimed = consumePendingIntakeClaim();
    if (claimed === null) return;
    setAnswers(claimed);
    setStepIndex(INTAKE_STEPS.length - 1);
    setHydratedFromClaim(true);
    if (claimed.statedRange !== null) void runMatch(1, claimed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  /**
   * The buyer's own explicit choice to keep this search across signing in —
   * never triggered by anything else. Best-effort: sign-in must proceed even
   * if the cookie could not be set.
   */
  const signInToKeepSearch = async () => {
    setSavingSearch(true);
    try {
      await fetch("/api/v1/buyer/intake-handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answers),
      });
    } catch {
      // Nothing kept; sign-in still proceeds.
    } finally {
      router.push(`/login?next=${encodeURIComponent(INTAKE_PATH)}`);
    }
  };

  const carried = handoffParams(answers);

  return (
    <div data-slot="intake-flow" className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <Eyebrow data-slot="intake-progress">
          {isSummary
            ? "Your answers"
            : `Step ${stepIndex + 1} of ${QUESTION_STEP_COUNT}`}
        </Eyebrow>
        {/*
         * The standing exit. "Intake is optional" in the buyer flow means a
         * visitor can leave at any point and still reach the whole catalog, so
         * this is on every step rather than only the first.
         */}
        <Link
          href={BROWSE_PATH}
          data-slot="intake-skip"
          className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
        >
          Skip this and browse everything
        </Link>
      </div>

      {hydratedFromClaim ? (
        <BodyText
          data-slot="intake-resumed"
          className="text-muted-foreground text-sm"
        >
          Welcome back. We kept the search you started before signing in.
          Nothing is locked in, so change anything below.
        </BodyText>
      ) : null}

      <div className={CARD_CLASS}>
        <div className="flex flex-col gap-5">
          <DisplayHeading level={2} className="text-3xl">
            {step.title}
          </DisplayHeading>

          {step.id === "priorities" ? (
            <>
              <BodyText className="text-muted-foreground text-sm">
                Choose up to {MAX_PRIORITIES}. Each one is answered from facts
                this catalog publishes. Nothing here is inferred.
              </BodyText>
              <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <legend className="sr-only">Your priorities</legend>
                {PRIORITY_OPTIONS.map((option) => {
                  const checked = answers.priorities.includes(option.key);
                  return (
                    <label key={option.key} className={CHOICE_CLASS}>
                      <input
                        type="checkbox"
                        value={option.key}
                        checked={checked}
                        disabled={
                          !checked &&
                          answers.priorities.length >= MAX_PRIORITIES
                        }
                        onChange={() =>
                          update({
                            priorities: togglePriority(
                              answers.priorities,
                              option.key,
                            ),
                          })
                        }
                        className={`${CONTROL_CLASS} rounded-sm`}
                      />
                      <span className="flex flex-col gap-1">
                        <span className="text-sm">{option.label}</span>
                        <span className="text-muted-foreground text-xs">
                          {option.grounding}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>
              {answers.priorities.length >= MAX_PRIORITIES ? (
                <BodyText
                  data-slot="priority-cap"
                  className="text-muted-foreground text-sm"
                >
                  That is {MAX_PRIORITIES}. Clear one to choose another.
                </BodyText>
              ) : null}
            </>
          ) : null}

          {step.id === "configuration" ? (
            <ChoiceQuestion
              name="Desired configuration"
              emptyMessage="No configurations are published yet, so there is nothing to choose from. You can carry on without answering this."
              options={options.bhkTypes}
              value={answers.bhk}
              onChange={(bhk) => update({ bhk })}
            />
          ) : null}

          {step.id === "city" ? (
            <ChoiceQuestion
              name="Desired city"
              emptyMessage="No cities are published yet, so there is nothing to choose from. You can carry on without answering this."
              options={options.cities.map((city) => ({
                key: city,
                label: city,
              }))}
              value={answers.city}
              onChange={(city) => update({ city })}
            />
          ) : null}

          {step.id === "range" ? (
            <>
              {/*
               * The copy is load-bearing, not decoration. A buyer who sets a
               * range on a property site will assume it is being matched
               * against prices unless told otherwise, and this catalog holds no
               * price a buyer can ever see.
               */}
              <BodyText className="text-muted-foreground text-sm">
                This is your own figure, in your own terms. PropCompare does not
                publish prices, and nothing here will be shown as costing what
                you set. Your range stays on this device. It is not sent
                anywhere, and it is not part of the link to your results.
              </BodyText>

              {answers.statedRange === null ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-fit px-4"
                  onClick={() => update({ statedRange: DEFAULT_STATED_RANGE })}
                >
                  State a range
                </Button>
              ) : (
                <>
                  <StatedRangeSlider
                    value={answers.statedRange}
                    onChange={(statedRange) => update({ statedRange })}
                  />
                  <button
                    type="button"
                    onClick={() => update({ statedRange: null })}
                    className="text-muted-foreground hover:text-foreground w-fit text-sm underline underline-offset-4"
                  >
                    I would rather not say
                  </button>
                </>
              )}
            </>
          ) : null}

          {isSummary ? (
            <>
              <BodyText className="text-muted-foreground text-sm">
                {hasAnyAnswer(answers)
                  ? "Here is what you said. Nothing below has been sent anywhere or saved."
                  : "You have not stated anything yet. You can go back and answer, or browse the whole catalog."}
              </BodyText>

              <dl data-slot="intake-brief" className="flex flex-col">
                <BriefRow
                  label="Priorities"
                  value={
                    answers.priorities.length > 0
                      ? describePriorities(answers.priorities).join(", ")
                      : "Not stated"
                  }
                />
                <BriefRow
                  label={FILTER_LABEL.bhk}
                  value={
                    answers.bhk === null
                      ? "Not stated"
                      : (options.bhkTypes.find((bhk) => bhk.key === answers.bhk)
                          ?.label ?? answers.bhk)
                  }
                />
                <BriefRow
                  label={FILTER_LABEL.city}
                  value={answers.city ?? "Not stated"}
                />
                <BriefRow
                  label="The range you stated"
                  value={
                    answers.statedRange === null
                      ? "Not stated"
                      : formatStatedRange(answers.statedRange)
                  }
                />
              </dl>

              {/*
               * Two different endings need two different sentences. With a
               * range, this really is a match and may say so. Without one, it
               * is still the browse screen with the answers that map to real
               * filters — and saying which is the difference between an honest
               * hand-off and a result set the buyer reads as "chosen for me".
               */}
              <BodyText
                data-slot="handoff-note"
                className="text-muted-foreground text-sm"
              >
                {answers.statedRange === null
                  ? carried.city === undefined && carried.bhk === undefined
                    ? "You have stated no city or configuration, so this opens the full catalog."
                    : `This opens the catalog filtered by ${[
                        carried.city === undefined ? null : "city",
                        carried.bhk === undefined ? null : "configuration",
                      ]
                        .filter((entry) => entry !== null)
                        .join(
                          " and ",
                        )}. Your priorities and your stated range are not part of that link.`
                  : "Your range is sent with this search so the catalog can be matched against it, and it is not saved, not written to your address bar, and not kept after you leave. Your priorities are not sent, because no published fact ranks against them."}
              </BodyText>

              {!signedIn && hasAnyAnswer(answers) ? (
                <div className="border-border flex flex-col items-start gap-2 border-t pt-5">
                  <BodyText className="text-muted-foreground text-sm">
                    Sign in and we will keep what you just told us, so you do
                    not have to state it again. Nothing is locked in: you can
                    still change any answer afterward.
                  </BodyText>
                  <button
                    type="button"
                    data-slot="intake-keep-search"
                    disabled={savingSearch}
                    onClick={() => void signInToKeepSearch()}
                    className="text-foreground hover:text-[var(--color-terracotta)] text-sm underline underline-offset-4 disabled:opacity-50"
                  >
                    {savingSearch
                      ? "Signing in…"
                      : "Sign in to keep this search"}
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          className="h-10 px-4"
          disabled={stepIndex === 0}
          onClick={() => setStepIndex((index) => Math.max(index - 1, 0))}
        >
          <ArrowLeft aria-hidden="true" />
          Back
        </Button>

        {isSummary ? (
          <>
            {/*
             * With a range, a button that runs a real match. Without one, the
             * original link — the endpoint requires both bounds, and a default
             * range invented here would be a figure the buyer never stated.
             */}
            {answers.statedRange === null ? (
              <Button asChild className="h-10 px-4">
                <Link href={handoffHref(answers)} data-slot="intake-handoff">
                  See matching properties
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            ) : (
              <Button
                type="button"
                className="h-10 px-4"
                data-slot="intake-match"
                disabled={match.status === "loading"}
                onClick={() => void runMatch(1)}
              >
                {match.status === "loading"
                  ? "Finding your matches…"
                  : "See your matches"}
                <ArrowRight aria-hidden="true" />
              </Button>
            )}
            <button
              type="button"
              onClick={restart}
              className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
            >
              Start again
            </button>
          </>
        ) : (
          <Button
            type="button"
            className="h-10 px-4"
            onClick={() =>
              setStepIndex((index) =>
                Math.min(index + 1, INTAKE_STEPS.length - 1),
              )
            }
          >
            {stepIndex === QUESTION_STEP_COUNT - 1 ? "See your brief" : "Next"}
            <ArrowRight aria-hidden="true" />
          </Button>
        )}
      </div>

      {/*
       * Below the controls, not replacing them: the brief stays on screen
       * beside its results, which is what makes "go back and widen the range"
       * a real instruction when nothing matched.
       */}
      {isSummary && answers.statedRange !== null ? (
        <IntakeMatchResults
          state={match}
          range={answers.statedRange}
          onPage={(page) => void runMatch(page)}
        />
      ) : null}
    </div>
  );
}
