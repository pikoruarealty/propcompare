/**
 * Where a reader is asked to send a report about a listing. A placeholder on a
 * reserved example domain (RFC 2606) so it can never belong to anyone; when a real
 * address exists this is the only line that changes (`DECISIONS.md`, 2026-09-24).
 */
export const REPORT_PROBLEM_EMAIL = "reports@propcompare.example";

/** A prefilled `mailto:` naming the property and its page, so the report arrives with context. */
export function reportProblemMailto(property?: {
  name: string;
  url: string;
}): string {
  const subject = property
    ? `Problem with ${property.name} on PropCompare`
    : "Problem with a listing on PropCompare";
  const body = property
    ? `Property: ${property.name}\nPage: ${property.url}\n\nWhat is wrong:\n`
    : "What is wrong:\n";
  return `mailto:${REPORT_PROBLEM_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
