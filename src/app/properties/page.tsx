import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { BrowseScreen } from "@/components/buyer/browse-screen";
import {
  browseHref,
  canonicalSearch,
  toSearchParams,
} from "@/lib/properties/browse";
import { listFilterOptions } from "@/lib/properties/filter-options";
import { parseListParams } from "@/lib/properties/http";
import { assertNoExcludedData } from "@/lib/properties/no-price";
import { listPublishedProperties } from "@/lib/properties/queries";
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  type ListPropertiesParams,
} from "@/lib/properties/types";

/**
 * `/properties` — the buyer browse and listing screen.
 *
 * **This page calls the read layer directly rather than fetching its own HTTP
 * API.** The obvious alternative — a server-side `fetch` of
 * `/api/v1/properties` — would make the server issue a request to itself during
 * render, needing an absolute origin URL it has no reliable way to know, and
 * would hand back JSON typed only by assertion. Calling
 * `listPublishedProperties` keeps the types checked end to end and removes a
 * network hop from every page view.
 *
 * The two things the HTTP route contributes are kept, not skipped: query
 * parameters go through the same `parseListParams` the API validates with, so
 * this page cannot accept a query the API would reject, and the response object
 * graph goes through the same `assertNoExcludedData` guard `buyerJsonResponse`
 * applies, so a price leaking into the read layer fails this page as loudly as
 * it fails the API. The API's `Cache-Control` policy is untouched and continues
 * to serve its own consumers. Recorded in DECISIONS.md (2026-09-07).
 *
 * The page reads `searchParams`, which renders it dynamically — correct here,
 * since the screen *is* its query string.
 */

export const metadata: Metadata = {
  title: "Browse properties — PropCompare",
  description:
    "Browse published properties by city, locality, configuration, possession status, and amenities. Compare stated facts, not prices.",
};

/** What the screen falls back to when the query string cannot be honoured. */
const DEFAULT_PARAMS: ListPropertiesParams = {
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  sort: DEFAULT_SORT,
};

export default async function BrowsePropertiesPage(
  props: PageProps<"/properties">,
) {
  const incoming = toSearchParams(await props.searchParams);

  // The filter form is a GET form, so it submits every control it owns —
  // including "Any city" as `?city=` and the default sort as `?sort=newest`.
  // Canonicalising first, and redirecting when it changes anything, means the
  // address bar ends up holding the query a buyer would actually share, and
  // means `parseListParams` below is never handed an empty value the form only
  // emitted because HTML forms have no way not to.
  const canonical = canonicalSearch(incoming);
  if (canonical.toString() !== incoming.toString()) {
    redirect(browseHref(canonical));
  }

  const parsed = parseListParams(canonical);
  const params = parsed.ok ? parsed.params : DEFAULT_PARAMS;

  const [result, options] = await Promise.all([
    listPublishedProperties(db, params),
    listFilterOptions(db),
  ]);

  return (
    <BrowseScreen
      params={params}
      options={options}
      result={assertNoExcludedData(result)}
      invalidQueryMessage={parsed.ok ? null : parsed.message}
    />
  );
}
