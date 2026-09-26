import { RELEASE_WINDOWS } from "@/db/schema/developer-analytics";

/**
 * The report windows a developer can pick (schema v21, `DECISIONS.md`
 * 2026-09-26). They are fixed, and they are the only ones that exist: the release
 * job writes exactly these five, so there is nothing to compute for any other
 * range and no custom range to compare against.
 *
 * Imports only the released-analytics schema file, never `lib/analytics`, so this
 * module stays clear of the raw-event isolation rule.
 */

export type ReportWindowKey = (typeof RELEASE_WINDOWS)[number];

export const REPORT_WINDOW_KEYS: readonly ReportWindowKey[] = RELEASE_WINDOWS;

export const DEFAULT_REPORT_WINDOW: ReportWindowKey = "30d";

export const WINDOW_LABELS: Record<ReportWindowKey, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  qtd: "Quarter to date",
  ytd: "Year to date",
  "12m": "Last 12 months",
};

/** A window key from a query string, or null when it is not one of the five. */
export const parseReportWindow = (
  value: string | null | undefined,
): ReportWindowKey | null =>
  REPORT_WINDOW_KEYS.find((key) => key === value) ?? null;

const indiaDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * How much of a window the tracking covers. Tracking started on a certain day and
 * nothing is invented before it, so a window that begins earlier is only partly
 * measured, and one that ends before it has nothing.
 */
export type WindowCoverage = "full" | "partial" | "none";

export const windowCoverage = (
  trackingSince: Date | null,
  window: { start: string; end: string },
): WindowCoverage => {
  if (!trackingSince) return "none";
  const first = indiaDay.format(trackingSince);
  if (first > window.end) return "none";
  return first <= window.start ? "full" : "partial";
};
