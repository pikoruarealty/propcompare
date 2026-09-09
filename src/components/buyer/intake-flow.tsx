"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BROWSE_PATH, FILTER_LABEL } from "@/lib/properties/browse";
import type { FilterOptions } from "@/lib/properties/filter-options";
import {
  DEFAULT_STATED_RANGE,
  EMPTY_ANSWERS,
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
 * Nothing here is persisted or transmitted. `POST /api/v1/intake-sessions` is
 * an explicit non-goal of Phase 2B and stays `Planned (Phase 3)` in the API
 * spec; matching is Phase 3 as well. So the flow ends by handing the buyer to
 * `/properties` carrying only the two answers that map to filters the read
 * contract actually has — city and configuration. The priorities and the stated
 * range are used for nothing, and `handoffParams` is written so they cannot
 * become part of that link by accident.
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
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<IntakeAnswers>(EMPTY_ANSWERS);

  const step = INTAKE_STEPS[stepIndex];
  const isSummary = step.id === "summary";
  const update = (patch: Partial<IntakeAnswers>) =>
    setAnswers((current) => ({ ...current, ...patch }));

  const restart = () => {
    setAnswers(EMPTY_ANSWERS);
    setStepIndex(0);
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

      <div className={CARD_CLASS}>
        <div className="flex flex-col gap-5">
          <DisplayHeading level={2} className="text-3xl">
            {step.title}
          </DisplayHeading>

          {step.id === "priorities" ? (
            <>
              <BodyText className="text-muted-foreground text-sm">
                Choose up to {MAX_PRIORITIES}. Each one is answered from facts
                this catalog publishes — nothing here is inferred.
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
                you set. Your range stays on this device — it is not sent
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
               * Matching is Phase 3, so this link is not a match — it is the
               * browse screen with the two answers that correspond to real
               * filters. Saying so is the difference between an honest hand-off
               * and a result set the buyer will read as "properties chosen for
               * me".
               */}
              <BodyText
                data-slot="handoff-note"
                className="text-muted-foreground text-sm"
              >
                {carried.city === undefined && carried.bhk === undefined
                  ? "You have stated no city or configuration, so this opens the full catalog."
                  : `This opens the catalog filtered by ${[
                      carried.city === undefined ? null : "city",
                      carried.bhk === undefined ? null : "configuration",
                    ]
                      .filter((entry) => entry !== null)
                      .join(
                        " and ",
                      )}. Your priorities and your stated range are not part of that link.`}
              </BodyText>
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
            <Button asChild className="h-10 px-4">
              <Link href={handoffHref(answers)} data-slot="intake-handoff">
                See matching properties
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
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
    </div>
  );
}
