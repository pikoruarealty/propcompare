import Link from "next/link";
import { X } from "lucide-react";
import {
  BROWSE_PATH,
  FILTER_LABEL,
  POSSESSION_STATUS_LABEL,
  SORT_LABEL,
  type ActiveFilter,
  activeFilters,
  hrefWithoutFilter,
  hrefWithoutFilters,
} from "@/lib/properties/browse";
import type { FilterOptions } from "@/lib/properties/filter-options";
import {
  DEFAULT_PAGE_SIZE,
  type ListPropertiesParams,
  type LookupRef,
  type PossessionStatus,
} from "@/lib/properties/types";
import { Eyebrow } from "./typography";

/**
 * The browse filter controls, as a plain `GET` form.
 *
 * There is no client-side state here and no `"use client"`. The filter set is
 * the URL, the form writes the URL, and the server renders from it — which
 * means every filtered view is a real address a buyer can bookmark, share, or
 * reach with the back button, and the screen works before any JavaScript
 * arrives. Radix's `Select` would have bought a prettier control at the cost of
 * making the whole browse screen a client component.
 *
 * The form deliberately carries no `page` field: applying a filter returns to
 * page 1, because the previous offset points into a result set that no longer
 * exists.
 *
 * The options come from published data (`listFilterOptions`), so a control
 * never offers a value that cannot match anything.
 */

const resolveLabel = (options: readonly LookupRef[], key: string): string =>
  // A key with no catalog entry still renders — as itself. It means the URL
  // carries a filter the vocabulary does not know, and showing the raw key says
  // so honestly rather than dropping the chip and leaving a result set narrowed
  // by something invisible.
  options.find((option) => option.key === key)?.label ?? key;

/** The human reading of one applied filter, for its chip. */
export const describeFilter = (
  filter: ActiveFilter,
  options: FilterOptions,
): string => {
  switch (filter.name) {
    case "city":
    case "locality":
      return filter.value;
    case "propertyType":
      return resolveLabel(options.propertyTypes, filter.value);
    case "bhk":
      return resolveLabel(options.bhkTypes, filter.value);
    case "amenity":
      return resolveLabel(options.amenities, filter.value);
    case "possessionStatus":
      return (
        POSSESSION_STATUS_LABEL[filter.value as PossessionStatus] ??
        filter.value
      );
  }
};

const FIELD_CLASS =
  "border-input bg-background text-foreground focus-visible:ring-ring w-full rounded-lg border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none";

/**
 * One labelled select. The current value is set on the `<select>` rather than
 * as `selected` on an `<option>` — React only reads the former, and the latter
 * silently renders an unselected control.
 */
function Field({
  name,
  label,
  value,
  children,
}: {
  name: string;
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  const id = `browse-filter-${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-muted-foreground text-sm">
        {label}
      </label>
      <select id={id} name={name} defaultValue={value} className={FIELD_CLASS}>
        {children}
      </select>
    </div>
  );
}

export interface BrowseFiltersProps {
  params: ListPropertiesParams;
  options: FilterOptions;
}

export function BrowseFilters({ params, options }: BrowseFiltersProps) {
  const selectedAmenities = new Set(params.amenity ?? []);

  return (
    <form
      method="get"
      action={BROWSE_PATH}
      data-slot="browse-filters"
      aria-label="Filter and sort properties"
      className="border-border bg-card flex flex-col gap-6 rounded-lg border p-6"
    >
      {/*
       * Page size is preserved across a filter change but has no control of its
       * own: it is a contract parameter a buyer may arrive with, not a choice
       * this screen asks them to make.
       */}
      {params.pageSize !== DEFAULT_PAGE_SIZE ? (
        <input type="hidden" name="pageSize" value={params.pageSize} />
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field name="city" label={FILTER_LABEL.city} value={params.city ?? ""}>
          <option value="">Any city</option>
          {options.cities.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </Field>

        <Field
          name="locality"
          label={FILTER_LABEL.locality}
          value={params.locality ?? ""}
        >
          <option value="">Any locality</option>
          {options.localities.map((locality) => (
            <option key={locality} value={locality}>
              {locality}
            </option>
          ))}
        </Field>

        <Field
          name="propertyType"
          label={FILTER_LABEL.propertyType}
          value={params.propertyType ?? ""}
        >
          <option value="">Any type</option>
          {options.propertyTypes.map((type) => (
            <option key={type.key} value={type.key}>
              {type.label}
            </option>
          ))}
        </Field>

        <Field name="bhk" label={FILTER_LABEL.bhk} value={params.bhk ?? ""}>
          <option value="">Any configuration</option>
          {options.bhkTypes.map((bhk) => (
            <option key={bhk.key} value={bhk.key}>
              {bhk.label}
            </option>
          ))}
        </Field>

        <Field
          name="possessionStatus"
          label={FILTER_LABEL.possessionStatus}
          value={params.possessionStatus ?? ""}
        >
          <option value="">Any possession status</option>
          {(
            Object.entries(POSSESSION_STATUS_LABEL) as [
              PossessionStatus,
              string,
            ][]
          ).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Field>

        <Field name="sort" label="Sort by" value={params.sort}>
          {Object.entries(SORT_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Field>
      </div>

      {options.amenities.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1">
            <Eyebrow>{FILTER_LABEL.amenity}</Eyebrow>
          </legend>
          {/*
           * Checking two amenities narrows rather than widens: a property must
           * record both as available. The wording says so, because a filter
           * list that behaves as AND while reading as OR quietly misreports how
           * small the result set is.
           */}
          <p className="text-muted-foreground text-sm">
            Selecting more than one shows only properties offering all of them.
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {options.amenities.map((amenity) => (
              <label
                key={amenity.key}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  name="amenity"
                  value={amenity.key}
                  defaultChecked={selectedAmenities.has(amenity.key)}
                  className="border-input accent-[var(--color-terracotta)] size-4 rounded-sm border"
                />
                {amenity.label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div>
        <button
          type="submit"
          className="bg-primary text-primary-foreground focus-visible:ring-ring rounded-lg px-4 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Apply
        </button>
      </div>
    </form>
  );
}

export interface ActiveFilterChipsProps {
  params: ListPropertiesParams;
  options: FilterOptions;
}

/**
 * The applied filters, each removable one at a time.
 *
 * This is what "retain filters and offer refinement" means in practice: a
 * buyer who finds no matches can see precisely what narrowed the search and
 * lift one constraint, rather than being handed a cleared form and asked to
 * start again.
 */
export function ActiveFilterChips({ params, options }: ActiveFilterChipsProps) {
  const applied = activeFilters(params);
  if (applied.length === 0) return null;

  return (
    <div
      data-slot="active-filters"
      className="flex flex-wrap items-center gap-2"
    >
      <Eyebrow>Filters</Eyebrow>
      {applied.map((filter) => (
        <Link
          key={`${filter.name}:${filter.value}`}
          href={hrefWithoutFilter(params, filter)}
          data-slot="active-filter"
          data-filter-name={filter.name}
          className="border-border bg-card text-foreground hover:border-[var(--color-terracotta)] inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors"
        >
          <span className="text-muted-foreground">
            {FILTER_LABEL[filter.name]}:
          </span>
          {describeFilter(filter, options)}
          <X aria-hidden="true" className="size-3.5" />
          <span className="sr-only">Remove this filter</span>
        </Link>
      ))}
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
