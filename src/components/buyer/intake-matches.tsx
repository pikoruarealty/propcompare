import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BROWSE_PATH } from "@/lib/properties/browse";
import {
  describeSearchedSpan,
  isOpenEndedTop,
} from "@/lib/properties/intake-matches";
import { type StatedRange, formatStatedRange } from "@/lib/properties/intake";
import type { PropertyListResult } from "@/lib/properties/types";
import { GridRow } from "./page-frame";
import { PropertyCard } from "./property-card";
import { BodyText, DisplayHeading, TabularValue } from "./typography";

/**
 * The matched results, rendered inside `/intake`.
 *
 * Pure presentation: it takes a state and renders it, exactly as `BrowseScreen`
 * takes `(params, options, result)`. `IntakeFlow` owns the request, because the
 * request body is built from the answers only that component holds. That split
 * is what lets every state here — including the failure and the honest empty —
 * be tested against fixtures with no network at all.
 *
 * Results live here rather than at a `/matches` address because the stated
 * range has nowhere else it may travel: not a URL (DECISIONS.md 2026-09-07),
 * not `sessionStorage` (rejected on the same record), and not yet a cookie
 * (deferred). The range stays in the client state that already holds it, and
 * the results come to the range. Recorded in DECISIONS.md (2026-09-18).
 *
 * No price, bound, or bucket value appears anywhere below. The only monetary
 * figures rendered are the ones the buyer typed and the span derived from them.
 */

/** The four states the panel can be in, as the flow hands them over. */
export type MatchViewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; result: PropertyListResult }
  | { status: "failed"; message: string };

const PANEL_CLASS = "border-border bg-card rounded-lg border p-6";

/**
 * What the buyer stated, and what was actually searched against it.
 *
 * The second sentence exists because the ±20% expansion (DECISIONS.md
 * 2026-09-01) is invisible otherwise, and an invisible product rule reads as a
 * broken filter the moment a result looks dearer than the stated figure.
 */
function SearchedSpan({ range }: { range: StatedRange }) {
  return (
    <div data-slot="searched-span" className="flex flex-col gap-2">
      <BodyText className="text-muted-foreground text-sm">
        You said {formatStatedRange(range)}. We searched a little either side of
        that — {describeSearchedSpan(range)} — because a property just outside a
        stated range is still worth seeing.
      </BodyText>

      {/*
       * The slider's "or more" now reaches the matcher as the open end it
       * always meant: the endpoint takes `maxUnbounded` and resolves the
       * ceiling against the catalog's own maximum inside the database. This
       * paragraph used to disclose a cap the contract forced on the buyer;
       * with the cap gone, it confirms its absence instead, because a buyer
       * who asked for no upper limit should be told they got one.
       */}
      {isOpenEndedTop(range) ? (
        <BodyText
          data-slot="open-top-disclosure"
          className="text-muted-foreground text-sm"
        >
          You left the top end open, so this search has no upper limit —
          everything published above that figure is included.
        </BodyText>
      ) : null}
    </div>
  );
}

/**
 * "Showing 1–6 of 6 properties", in the browse screen's wording so the two
 * result surfaces count the same way. It renders only alongside results; the
 * empty case is `NoMatches`, which has more to say than a zero.
 */
function MatchSummary({ result }: { result: PropertyListResult }) {
  const { page, pageSize } = result.pagination;

  const first = (page - 1) * pageSize + 1;
  const last = first + result.data.length - 1;

  return (
    <p data-slot="match-summary" className="text-muted-foreground text-sm">
      Showing <TabularValue>{first}</TabularValue>–
      <TabularValue>{last}</TabularValue> of{" "}
      <TabularValue>{result.pagination.total}</TabularValue>{" "}
      {result.pagination.total === 1 ? "property" : "properties"}
    </p>
  );
}

function MatchPagination({
  result,
  onPage,
}: {
  result: PropertyListResult;
  onPage: (page: number) => void;
}) {
  const { page, totalPages } = result.pagination;
  if (totalPages <= 1) return null;

  // Buttons, not links: there is no address for page 2 of a search whose input
  // may not appear in a URL. An unavailable direction is inert text rather than
  // a disabled control that looks like it might work.
  const buttonClass =
    "border-border text-foreground hover:border-[var(--color-terracotta)] inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors";
  const inertClass =
    "border-border text-muted-foreground inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-sm";

  return (
    <nav
      data-slot="match-pagination"
      aria-label="Match pagination"
      className="flex items-center justify-between gap-4"
    >
      {page > 1 ? (
        <button
          type="button"
          className={buttonClass}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          Previous
        </button>
      ) : (
        <span className={inertClass} aria-disabled="true">
          <ChevronLeft aria-hidden="true" className="size-4" />
          Previous
        </span>
      )}

      <p className="text-muted-foreground text-sm">
        Page <TabularValue>{page}</TabularValue> of{" "}
        <TabularValue>{totalPages}</TabularValue>
      </p>

      {page < totalPages ? (
        <button
          type="button"
          className={buttonClass}
          onClick={() => onPage(page + 1)}
        >
          Next
          <ChevronRight aria-hidden="true" className="size-4" />
        </button>
      ) : (
        <span className={inertClass} aria-disabled="true">
          Next
          <ChevronRight aria-hidden="true" className="size-4" />
        </span>
      )}
    </nav>
  );
}

/**
 * Nothing matched — the buyer flow's "No matching inventory" exception path.
 *
 * It retains the brief and offers refinement, and it widens nothing on the
 * buyer's behalf: no "similar properties", no quietly dropped filter, no
 * substituted result. The brief is still on screen above this, which is what
 * makes "go back and change one" a real instruction rather than a gesture.
 */
function NoMatches() {
  return (
    <div
      data-slot="match-empty"
      data-empty-reason="no-match"
      className="flex flex-col gap-4"
    >
      <DisplayHeading level={3}>
        Nothing published matches that yet
      </DisplayHeading>
      <BodyText className="text-muted-foreground">
        Your brief is unchanged above and nothing has been substituted for it.
        Go back and widen the range, drop the city or the configuration, or see
        everything that is published.
      </BodyText>
      <Link
        href={BROWSE_PATH}
        data-slot="match-empty-browse"
        className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
      >
        Browse the whole catalog
      </Link>
    </div>
  );
}

export interface IntakeMatchResultsProps {
  state: MatchViewState;
  /** The range the results were requested for, for the disclosure above them. */
  range: StatedRange;
  onPage: (page: number) => void;
}

export function IntakeMatchResults({
  state,
  range,
  onPage,
}: IntakeMatchResultsProps) {
  if (state.status === "idle") return null;

  if (state.status === "loading") {
    return (
      <div data-slot="match-results" className={PANEL_CLASS}>
        <BodyText
          data-slot="match-loading"
          role="status"
          className="text-muted-foreground text-sm"
        >
          Finding what matches…
        </BodyText>
      </div>
    );
  }

  if (state.status === "failed") {
    return (
      <div data-slot="match-results" className={PANEL_CLASS}>
        <div className="flex flex-col gap-4">
          {/*
           * A failed search is not an empty one. Rendering "nothing matched"
           * here would tell the buyer something false about the catalog.
           */}
          <DisplayHeading level={3}>That search did not run</DisplayHeading>
          <BodyText
            data-slot="match-error"
            role="status"
            className="text-muted-foreground"
          >
            {state.message}
          </BodyText>
          <Link
            href={BROWSE_PATH}
            className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
          >
            Browse the whole catalog
          </Link>
        </div>
      </div>
    );
  }

  const { result } = state;

  return (
    <div data-slot="match-results" className="flex flex-col gap-6">
      <div className={PANEL_CLASS}>
        <div className="flex flex-col gap-4">
          <DisplayHeading level={2} className="text-3xl">
            What matches your brief
          </DisplayHeading>
          <SearchedSpan range={range} />
          {result.data.length === 0 ? (
            <NoMatches />
          ) : (
            <MatchSummary result={result} />
          )}
        </div>
      </div>

      {result.data.length > 0 ? (
        <>
          <GridRow role="list" data-slot="match-grid">
            {result.data.map((property) => (
              <div
                key={property.id}
                role="listitem"
                className="md:col-span-6 lg:col-span-6"
              >
                <PropertyCard property={property} />
              </div>
            ))}
          </GridRow>
          <MatchPagination result={result} onPage={onPage} />
        </>
      ) : null}
    </div>
  );
}
