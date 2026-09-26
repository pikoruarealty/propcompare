/** Where a figure on the admin Analytics screen opens to. */

export const VISITORS_PATH = "/admin/analytics/visitors";

/** The visitors list for a period, narrowed by a query such as `reached=opened`. */
export const visitorsHref = (days: number, query?: string): string =>
  `${VISITORS_PATH}?days=${days}${query ? `&${query}` : ""}`;
