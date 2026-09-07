import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  activeFilters,
  hrefForPage,
  hrefWithoutFilters,
} from "@/lib/properties/browse";
import type { FilterOptions } from "@/lib/properties/filter-options";
import type {
  ListPropertiesParams,
  PropertyListResult,
} from "@/lib/properties/types";
import { ActiveFilterChips, BrowseFilters } from "./browse-filters";
import { GridRow, PageContainer, PageFrame, PageSection } from "./page-frame";
import { PropertyCard } from "./property-card";
import { BodyText, DisplayHeading, Eyebrow, TabularValue } from "./typography";

/**
 * The browse screen: filters, the results grid, its empty states, and
 * pagination.
 *
 * It is a pure function of `(params, options, result)` — no data fetching, no
 * database, no `searchParams` reading. `src/app/properties/page.tsx` does all
 * of that and hands the answers here, which is what lets the whole screen,
 * including its empty and rejected-query states, be tested against the step 2
 * fixtures rather than only against a running Postgres.
 */

/**
 * The results themselves, or an honest account of why there are none.
 *
 * The buyer flow's exception path is explicit: with no matching inventory,
 * retain the filters and offer refinement rather than fabricate a match. So
 * neither empty state widens the search on the buyer's behalf, drops back to
 * "similar properties", or shows anything the filters did not ask for.
 */
function BrowseResults({
  params,
  result,
}: {
  params: ListPropertiesParams;
  result: PropertyListResult;
}) {
  if (result.data.length > 0) {
    return (
      <GridRow role="list" data-slot="property-grid">
        {result.data.map((property) => (
          <div
            key={property.id}
            role="listitem"
            className="md:col-span-6 lg:col-span-4"
          >
            <PropertyCard property={property} />
          </div>
        ))}
      </GridRow>
    );
  }

  const applied = activeFilters(params);

  // No filters and no rows is a different fact from no matches, and saying
  // "try removing a filter" to someone who applied none would be nonsense.
  if (applied.length === 0) {
    return (
      <div
        data-slot="browse-empty"
        data-empty-reason="catalog-empty"
        className="border-border bg-card rounded-lg border p-8"
      >
        <DisplayHeading level={3}>No properties published yet</DisplayHeading>
        <BodyText className="text-muted-foreground mt-2">
          Nothing has been published to the catalog so far. This page lists
          published properties only, so there is nothing to show rather than
          anything to approximate.
        </BodyText>
      </div>
    );
  }

  return (
    <div
      data-slot="browse-empty"
      data-empty-reason="no-match"
      className="border-border bg-card flex flex-col gap-4 rounded-lg border p-8"
    >
      <DisplayHeading level={3}>
        No properties match these filters
      </DisplayHeading>
      <BodyText className="text-muted-foreground">
        {applied.length === 1
          ? "Your filter is still applied"
          : `All ${applied.length} of your filters are still applied`}{" "}
        and nothing has been substituted for them. Remove one above to widen the
        search, or start again.
      </BodyText>
      <Link
        href={hrefWithoutFilters(params)}
        data-slot="clear-filters"
        className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
      >
        Clear all filters
      </Link>
    </div>
  );
}

function BrowsePagination({
  params,
  result,
}: {
  params: ListPropertiesParams;
  result: PropertyListResult;
}) {
  const { page, totalPages } = result.pagination;
  if (totalPages <= 1) return null;

  const previous = page > 1 ? hrefForPage(params, page - 1) : null;
  const next = page < totalPages ? hrefForPage(params, page + 1) : null;

  // An unavailable direction renders as inert text rather than a link to
  // nowhere: there is no page 0, and offering one would be a control that lies.
  const linkClass =
    "border-border text-foreground hover:border-[var(--color-terracotta)] inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors";
  const inertClass =
    "border-border text-muted-foreground inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-sm";

  return (
    <nav
      data-slot="browse-pagination"
      aria-label="Pagination"
      className="flex items-center justify-between gap-4"
    >
      {previous === null ? (
        <span className={inertClass} aria-disabled="true">
          <ChevronLeft aria-hidden="true" className="size-4" />
          Previous
        </span>
      ) : (
        <Link href={previous} rel="prev" className={linkClass}>
          <ChevronLeft aria-hidden="true" className="size-4" />
          Previous
        </Link>
      )}

      <p className="text-muted-foreground text-sm">
        Page <TabularValue>{page}</TabularValue> of{" "}
        <TabularValue>{totalPages}</TabularValue>
      </p>

      {next === null ? (
        <span className={inertClass} aria-disabled="true">
          Next
          <ChevronRight aria-hidden="true" className="size-4" />
        </span>
      ) : (
        <Link href={next} rel="next" className={linkClass}>
          Next
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      )}
    </nav>
  );
}

/** "Showing 1–20 of 42 properties", or an honest zero. */
function ResultSummary({ result }: { result: PropertyListResult }) {
  const { page, pageSize, total } = result.pagination;

  if (total === 0) {
    return (
      <p data-slot="result-summary" className="text-muted-foreground text-sm">
        No properties
      </p>
    );
  }

  const first = (page - 1) * pageSize + 1;
  const last = first + result.data.length - 1;

  return (
    <p data-slot="result-summary" className="text-muted-foreground text-sm">
      Showing <TabularValue>{first}</TabularValue>–
      <TabularValue>{last}</TabularValue> of{" "}
      <TabularValue>{total}</TabularValue>{" "}
      {total === 1 ? "property" : "properties"}
    </p>
  );
}

export interface BrowseScreenProps {
  params: ListPropertiesParams;
  options: FilterOptions;
  result: PropertyListResult;
  /**
   * Set when the incoming query string failed the listing contract. The screen
   * then shows unfiltered results and says so — a browse page that returned a
   * bare 422 would strand a buyer who followed a stale link, and one that
   * silently ignored the bad parameter would show a result set that is not the
   * one the URL describes.
   */
  invalidQueryMessage?: string | null;
}

export function BrowseScreen({
  params,
  options,
  result,
  invalidQueryMessage = null,
}: BrowseScreenProps) {
  return (
    <PageFrame>
      <PageContainer>
        <PageSection className="flex flex-col gap-8">
          {/*
           * A `div`, not a `header`: the buyer shell already owns the page's
           * banner landmark, and a second one here would leave assistive
           * technology with two headers to choose between.
           */}
          <div className="flex flex-col gap-3">
            <Eyebrow>Browse</Eyebrow>
            <DisplayHeading level={1}>Published properties</DisplayHeading>
            <BodyText className="text-muted-foreground">
              Every property here is published, and every fact shown is one the
              catalog records. Prices are not part of this catalog — compare on
              configuration, location, possession, and what a developer has
              actually stated.
            </BodyText>
          </div>

          {invalidQueryMessage === null ? null : (
            <div
              data-slot="invalid-query-notice"
              role="status"
              className="border-border bg-muted flex flex-col items-start gap-2 rounded-lg border p-4"
            >
              <BodyText className="text-foreground text-sm">
                This link&rsquo;s filters could not be applied, so every
                published property is shown instead. {invalidQueryMessage}
              </BodyText>
              <Link
                href={hrefWithoutFilters(params)}
                className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
              >
                Start a fresh search
              </Link>
            </div>
          )}

          <BrowseFilters params={params} options={options} />

          <div className="flex flex-col gap-4">
            <ActiveFilterChips params={params} options={options} />
            <ResultSummary result={result} />
          </div>

          <BrowseResults params={params} result={result} />

          <BrowsePagination params={params} result={result} />
        </PageSection>
      </PageContainer>
    </PageFrame>
  );
}
