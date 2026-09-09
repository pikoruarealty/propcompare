/**
 * The guided-intake vocabulary, answer shape, and URL arithmetic.
 *
 * Everything here is pure and holds no state. The flow itself
 * (`src/components/buyer/intake-flow.tsx`) is the only client component in the
 * buyer surface, and keeping its vocabulary and its hand-off arithmetic out
 * here means both can be tested with no DOM — the same split the browse screen
 * uses with `./browse`.
 *
 * Three rules shape this module, all recorded in DECISIONS.md (2026-09-07):
 *
 * 1. **The priority vocabulary is grounded in published facts.** Every option
 *    below names a fact class the catalog actually publishes, so a priority can
 *    never promise an answer the data cannot give. It lives as a code constant
 *    rather than a catalog table because `buyer_intake_sessions.persona_priorities`
 *    is `jsonb` by design and persistence is Phase 3; it is not free text,
 *    because an uncontrolled vocabulary here would become a second de-facto
 *    contract the moment matching is built against it.
 *
 * 2. **The stated range is the buyer's own figure, never a price and never a
 *    bucket.** It is captured in coarse steps, it is described in the buyer's
 *    own terms, and no property figure is ever shown against it. Budget buckets
 *    are the private matching mechanism (`ARCHITECTURE.md`) and never surface
 *    here.
 *
 * 3. **The range never leaves the device.** `handoffParams` names the two
 *    fields it carries one at a time rather than spreading the answers, so a
 *    new answer field cannot reach a URL by accident — which is the whole risk,
 *    since a query string lands in browser history, server logs, and the
 *    `Referer` header of every request that follows.
 */

import { hrefForParams } from "./browse";
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  type ListPropertiesParams,
} from "./types";

export const INTAKE_PATH = "/intake";

/* -------------------------------------------------------------------------- */
/* Persona priorities                                                          */
/* -------------------------------------------------------------------------- */

export const PRIORITY_KEYS = [
  "family_space",
  "location",
  "possession_speed",
  "amenities",
  "privacy",
  "build_quality",
] as const;

export type PriorityKey = (typeof PRIORITY_KEYS)[number];

export interface PriorityOption {
  key: PriorityKey;
  label: string;
  /**
   * The published fact class this priority reads. Shown to the buyer, because a
   * priority the catalog cannot answer would be a question asked in bad faith.
   */
  grounding: string;
}

export const PRIORITY_OPTIONS: readonly PriorityOption[] = [
  {
    key: "family_space",
    label: "Room for a family",
    grounding: "Read from published unit areas and room dimensions.",
  },
  {
    key: "location",
    label: "The locality itself",
    grounding: "Read from the published city and locality.",
  },
  {
    key: "possession_speed",
    label: "Moving in sooner",
    grounding: "Read from published possession status and possession date.",
  },
  {
    key: "amenities",
    label: "What the project offers on site",
    grounding: "Read from recorded amenities, including the ones not offered.",
  },
  {
    key: "privacy",
    label: "Privacy and low density",
    grounding: "Read from the published tower and unit counts.",
  },
  {
    key: "build_quality",
    label: "How it is specified and built",
    grounding: "Read from published specifications.",
  },
] as const;

export const PRIORITY_LABEL: Record<PriorityKey, string> = Object.fromEntries(
  PRIORITY_OPTIONS.map((option) => [option.key, option.label]),
) as Record<PriorityKey, string>;

/**
 * Three, so the answer says something. A buyer who marks all six has stated no
 * priority at all, and Phase 3's matching would have nothing to weigh.
 */
export const MAX_PRIORITIES = 3;

/**
 * Adds or removes one priority. At the cap, selecting another is a no-op rather
 * than a silent eviction of an earlier choice — the flow disables the remaining
 * options and says why, so nothing disappears without the buyer doing it.
 */
export const togglePriority = (
  priorities: readonly PriorityKey[],
  key: PriorityKey,
): PriorityKey[] => {
  if (priorities.includes(key)) {
    return priorities.filter((entry) => entry !== key);
  }
  if (priorities.length >= MAX_PRIORITIES) return [...priorities];
  return [...priorities, key];
};

/** The chosen priorities as labels, in the order the buyer picked them. */
export const describePriorities = (
  priorities: readonly PriorityKey[],
): string[] => priorities.map((key) => PRIORITY_LABEL[key]);

/* -------------------------------------------------------------------------- */
/* The stated range                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Held in lakh rather than rupees, and named for what it is: a range the buyer
 * stated. It is deliberately *not* named after
 * `buyer_intake_sessions.budget_min_inr` / `budget_max_inr` — an `Inr` suffix
 * trips `findForbiddenKeys` in `./no-price`, which runs in production, and
 * mirroring the column names here would mean either weakening that guard or
 * carrying a shape that cannot be handed to anything.
 */
export interface StatedRange {
  fromLakh: number;
  toLakh: number;
}

export const RANGE_MIN_LAKH = 10;
export const RANGE_MAX_LAKH = 500;

/**
 * Five lakh a notch. The control is a slider by the maintainer's decision
 * (2026-09-07), and a coarse step is what keeps a slider from implying that any
 * exact rupee figure is meaningful here — the buyer is stating a range, not
 * reading one off the catalog.
 */
export const RANGE_STEP_LAKH = 5;

/** Where both handles start when a buyer first reaches the question. */
export const DEFAULT_STATED_RANGE: StatedRange = { fromLakh: 50, toLakh: 150 };

const clampToScale = (value: number): number => {
  const stepped =
    Math.round(value / RANGE_STEP_LAKH) * RANGE_STEP_LAKH || RANGE_MIN_LAKH;
  return Math.min(Math.max(stepped, RANGE_MIN_LAKH), RANGE_MAX_LAKH);
};

/**
 * Moving one handle past the other clamps it rather than pushing the other
 * along. Pushing loses a value the buyer set deliberately; clamping keeps it.
 */
export const withLowerEnd = (
  range: StatedRange,
  next: number,
): StatedRange => ({
  fromLakh: Math.min(clampToScale(next), range.toLakh),
  toLakh: range.toLakh,
});

export const withUpperEnd = (
  range: StatedRange,
  next: number,
): StatedRange => ({
  fromLakh: range.fromLakh,
  toLakh: Math.max(clampToScale(next), range.fromLakh),
});

/** Where a handle sits on the track, as a percentage. */
export const rangePercent = (value: number): number =>
  ((value - RANGE_MIN_LAKH) / (RANGE_MAX_LAKH - RANGE_MIN_LAKH)) * 100;

const trimTrailingZeros = (value: number): string =>
  Number(value.toFixed(2)).toString();

/** `50` reads as `₹50 lakh`; `250` reads as `₹2.5 crore`. */
export const formatStatedFigure = (lakh: number): string =>
  lakh >= 100
    ? `₹${trimTrailingZeros(lakh / 100)} crore`
    : `₹${trimTrailingZeros(lakh)} lakh`;

/**
 * The top of the scale is open-ended. A slider that stops at ₹5 crore would
 * otherwise put words in the mouth of a buyer whose range runs past it.
 */
export const formatStatedRange = (range: StatedRange): string =>
  `${formatStatedFigure(range.fromLakh)} to ${formatStatedFigure(range.toLakh)}${
    range.toLakh >= RANGE_MAX_LAKH ? " or more" : ""
  }`;

/* -------------------------------------------------------------------------- */
/* Answers and steps                                                           */
/* -------------------------------------------------------------------------- */

export interface IntakeAnswers {
  priorities: PriorityKey[];
  /** A `bhk_types` lookup key, or `null` when the question was skipped. */
  bhk: string | null;
  city: string | null;
  statedRange: StatedRange | null;
}

export const EMPTY_ANSWERS: IntakeAnswers = {
  priorities: [],
  bhk: null,
  city: null,
  statedRange: null,
};

export const INTAKE_STEP_IDS = [
  "priorities",
  "configuration",
  "city",
  "range",
  "summary",
] as const;

export type IntakeStepId = (typeof INTAKE_STEP_IDS)[number];

export interface IntakeStep {
  id: IntakeStepId;
  /** The question, as the buyer reads it. */
  title: string;
}

export const INTAKE_STEPS: readonly IntakeStep[] = [
  { id: "priorities", title: "What matters most to you?" },
  { id: "configuration", title: "What configuration are you looking for?" },
  { id: "city", title: "Where are you looking?" },
  { id: "range", title: "The range you are working with" },
  { id: "summary", title: "Your brief" },
] as const;

/** The summary is not a question, so it is not counted in "step 2 of 4". */
export const QUESTION_STEP_COUNT = INTAKE_STEPS.length - 1;

export const stepIndexOf = (id: IntakeStepId): number =>
  INTAKE_STEPS.findIndex((step) => step.id === id);

/** True once the buyer has stated anything at all. */
export const hasAnyAnswer = (answers: IntakeAnswers): boolean =>
  answers.priorities.length > 0 ||
  answers.bhk !== null ||
  answers.city !== null ||
  answers.statedRange !== null;

/* -------------------------------------------------------------------------- */
/* Hand-off to browse                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The only two intake answers that correspond to a filter the read contract
 * actually has. Stated as a constant so the guard test can assert the hand-off
 * URL carries nothing else.
 */
export const HANDOFF_PARAMETER_NAMES = ["city", "bhk"] as const;

/**
 * Intake ends by handing the buyer to `/properties` with the filters that
 * genuinely exist — matching is Phase 3 and `POST /api/v1/intake-sessions` is
 * an explicit non-goal of this phase, so intake cannot produce matches and must
 * not pretend to.
 *
 * The two fields are named one at a time on purpose. Spreading `answers` here
 * would put the stated range into the query string the first time this function
 * was edited without thinking, and a range in a URL is the closest this
 * application could come to publishing a monetary figure.
 */
export const handoffParams = (answers: IntakeAnswers): ListPropertiesParams => {
  const params: ListPropertiesParams = {
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    sort: DEFAULT_SORT,
  };

  if (answers.city !== null) params.city = answers.city;
  if (answers.bhk !== null) params.bhk = answers.bhk;

  return params;
};

/** The browse URL the summary step links to. */
export const handoffHref = (answers: IntakeAnswers): string =>
  hrefForParams(handoffParams(answers));
