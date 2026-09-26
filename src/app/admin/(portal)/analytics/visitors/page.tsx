import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import {
  Empty,
  duration,
  td,
  tdNum,
  th,
} from "@/components/admin/analytics/panels";
import { requirePortalRole } from "@/lib/accounts/session";
import {
  DASHBOARD_PERIODS,
  periodRange,
  type DashboardPeriod,
} from "@/lib/analytics/dashboard";
import {
  FUNNEL_LABEL,
  listVisitors,
  propertyNames,
  readVisitorFilter,
  type VisitorFilter,
} from "@/lib/analytics/visitors";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Visitors | Admin console",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

const dateTime = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

type Query = {
  days?: string | string[];
  reached?: string | string[];
  stopped?: string | string[];
  property?: string | string[];
  pair?: string | string[];
};

const first = (value: string | string[] | undefined): string | null =>
  (Array.isArray(value) ? value[0] : value) ?? null;

/** What the list is narrowed to, in a sentence. */
const describe = (
  filter: VisitorFilter,
  named: Map<string, string>,
): string => {
  const parts: string[] = [];
  if (filter.reached === "gate") {
    parts.push("reached a comparison locked behind sign-in");
  } else if (filter.reached) {
    parts.push(`got as far as "${FUNNEL_LABEL[filter.reached]}"`);
  }
  if (filter.stopped) {
    parts.push(`stopped after "${FUNNEL_LABEL[filter.stopped]}"`);
  }
  if (filter.propertyId) {
    parts.push(
      `viewed or compared ${named.get(filter.propertyId) ?? "a property"}`,
    );
  }
  if (filter.pair) {
    parts.push(
      `compared ${named.get(filter.pair[0]) ?? "a property"} with ${named.get(filter.pair[1]) ?? "a property"}`,
    );
  }
  return parts.length === 0
    ? "Every visitor in this period."
    : `Visitors who ${parts.join(" and ")}.`;
};

/**
 * The visitors behind a figure on the Analytics screen. A visitor is an anonymous
 * browser id: no name, phone or account, and only events that still carry an id
 * (`DECISIONS.md` 2026-09-26).
 */
export default async function VisitorsPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const session = await requirePortalRole("admin", "/admin/analytics/visitors");
  const query = await searchParams;
  const asked = Number(first(query.days));
  const days: DashboardPeriod = (
    DASHBOARD_PERIODS as readonly number[]
  ).includes(asked)
    ? (asked as DashboardPeriod)
    : 30;
  const filter = readVisitorFilter({
    reached: first(query.reached),
    stopped: first(query.stopped),
    property: first(query.property),
    pair: first(query.pair),
  });
  const { rows, total } = await listVisitors(db, periodRange(days), filter);
  const named = await propertyNames(db, [
    ...(filter.propertyId ? [filter.propertyId] : []),
    ...(filter.pair ?? []),
  ]);

  return (
    <AdminShell active="analytics" email={session.email}>
      <AdminPageHeader
        title="Visitors"
        description={`${describe(filter, named)} ${total} in the last ${days} days. A visitor is one browser, told apart by a random id: nothing here names a person.`}
        action={
          <Link
            href={`/admin/analytics${days === 30 ? "" : `?days=${days}`}`}
            className="text-primary text-sm underline underline-offset-4"
          >
            Back to Analytics
          </Link>
        }
      />

      <div className="border-border bg-card overflow-x-auto rounded-lg border">
        {rows.length === 0 ? (
          <Empty>
            No visitor matches. Browsers that send a privacy signal are recorded
            without an id, so they are counted in the figures but cannot be
            listed here.
          </Empty>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-border bg-muted/50 border-b">
                <th scope="col" className={th}>
                  Visitor
                </th>
                <th scope="col" className={th}>
                  Last seen
                </th>
                <th scope="col" className={cn(th, "text-right")}>
                  Visits
                </th>
                <th scope="col" className={cn(th, "text-right")}>
                  Events
                </th>
                <th scope="col" className={cn(th, "text-right")}>
                  Time
                </th>
                <th scope="col" className={th}>
                  Device, source
                </th>
                <th scope="col" className={th}>
                  What they did
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.visitorId}
                  data-slot="visitor-row"
                  className="border-border border-b align-top last:border-b-0"
                >
                  <td className={td}>
                    <Link
                      href={`/admin/analytics/visitors/${row.visitorId}`}
                      className="text-primary underline underline-offset-4"
                    >
                      {row.label}
                    </Link>
                  </td>
                  <td className={td}>
                    {dateTime.format(new Date(row.lastSeen))}
                  </td>
                  <td className={tdNum}>{row.visits}</td>
                  <td className={tdNum}>{row.events}</td>
                  <td className={tdNum}>{duration(row.engagedSeconds)}</td>
                  <td className={td}>
                    {row.device}
                    {row.source ? `, ${row.source}` : ""}
                  </td>
                  <td className={td}>
                    <span className="block">
                      {row.viewed.length === 0
                        ? "Viewed no property"
                        : `Viewed ${row.viewed.join(", ")}`}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {[
                        row.comparisons > 0
                          ? `compared ${row.comparisons} ${row.comparisons === 1 ? "time" : "times"}`
                          : null,
                        row.signedIn ? "signed in" : null,
                        row.enquired ? "sent an enquiry" : null,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {total > rows.length ? (
        <p className="text-muted-foreground mt-3 text-sm">
          Showing the {rows.length} most recent of {total}.
        </p>
      ) : null}
    </AdminShell>
  );
}
