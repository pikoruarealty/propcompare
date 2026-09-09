import { cn } from "@/lib/utils";
import type { CatalogItemStatus } from "@/lib/properties/types";

/**
 * The honest-incompleteness primitive.
 *
 * The catalog records three distinct states for a controlled fact, and the
 * difference between them is information a buyer needs: `available` is a
 * stated fact, `not_stated` means nobody has answered the question, and
 * `explicitly_not_offered` means the developer answered "no". A UI that
 * renders the last two identically — as a blank, a dash, or an em-dash that
 * reads like a value — destroys that distinction and quietly invents a fourth
 * meaning. `docs/design/design.v1.md` forbids it; this component is where the
 * rule is kept.
 *
 * Nothing here ever renders a plausible placeholder: no "0", no "N/A", no
 * empty string, no guessed value.
 */

/** User-facing wording, exported so screens and their tests agree on it. */
export const FACT_STATUS_LABEL: Record<CatalogItemStatus, string> = {
  available: "Available",
  not_stated: "Not stated",
  explicitly_not_offered: "Not offered",
};

/**
 * The explanation each state carries. `not_stated` is an open question;
 * `explicitly_not_offered` is a closed one. Saying so is what stops a reader
 * treating an unanswered question as a "no".
 */
const FACT_STATUS_TITLE: Record<CatalogItemStatus, string> = {
  available: "Stated for this property.",
  not_stated: "Not stated for this property — the fact has not been recorded.",
  explicitly_not_offered: "Stated as not offered for this property.",
};

/**
 * Each state is visually distinct as well as textually distinct. Neither
 * absence state uses the destructive colour: an amenity a developer does not
 * offer is a fact, not an error.
 */
const FACT_STATUS_STYLE: Record<CatalogItemStatus, string> = {
  available: "text-foreground",
  not_stated: "text-muted-foreground italic",
  explicitly_not_offered: "text-muted-foreground font-medium",
};

export interface FactValueProps {
  /**
   * The recorded state. When omitted it is derived from `value`: a present
   * value is `available`, an absent one is `not_stated`. Pass it explicitly
   * for catalog facts, which carry their own status.
   */
  status?: CatalogItemStatus;
  /** The stated value, when there is one. */
  value?: string | number | null;
  /** Use tabular numerals — for areas, dates, and counts. */
  tabular?: boolean;
  className?: string;
}

const isBlank = (value: string | number | null | undefined): boolean =>
  value === null || value === undefined || String(value).trim() === "";

export function FactValue({
  status,
  value,
  tabular = false,
  className,
}: FactValueProps) {
  // An explicit status always wins. It is the recorded fact; a value sitting
  // beside a `not_stated` status is a data defect, and rendering the value
  // anyway would hide it.
  const resolved: CatalogItemStatus =
    status ?? (isBlank(value) ? "not_stated" : "available");

  // `available` with nothing to show is the amenity case: the fact is that the
  // property has the thing, and the label beside this carries what the thing
  // is. It renders the affirmation rather than a blank.
  const isStatedValue = resolved === "available" && !isBlank(value);
  const text = isStatedValue ? String(value) : FACT_STATUS_LABEL[resolved];

  return (
    <span
      data-slot="fact-value"
      data-fact-status={resolved}
      title={FACT_STATUS_TITLE[resolved]}
      className={cn(
        FACT_STATUS_STYLE[resolved],
        tabular && isStatedValue && "data-tabular",
        className,
      )}
    >
      {text}
    </span>
  );
}
