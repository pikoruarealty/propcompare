import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { db } from "@/db";
import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { LiveRefresh } from "@/components/admin/analytics/live-refresh";
import {
  BreakdownTable,
  CountTable,
  DailyTrend,
  duration,
  Empty,
  Funnel,
  Panel,
  percent,
  StatTiles,
  td,
  tdNum,
  th,
} from "@/components/admin/analytics/panels";
import { requirePortalRole } from "@/lib/accounts/session";
import {
  DASHBOARD_PERIODS,
  loadAnalyticsDashboard,
  periodRange,
  type DashboardPeriod,
} from "@/lib/analytics/dashboard";
import { recordingMode } from "@/lib/analytics/events";
import { insightsOf } from "@/lib/analytics/insights";
import { visitorsHref } from "@/lib/analytics/links";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Analytics | Admin console",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

const PERIOD_LABEL: Record<DashboardPeriod, string> = {
  7: "7 days",
  30: "30 days",
  90: "90 days",
  365: "12 months",
};

/**
 * How buyers find, compare and choose, read live from first-party events (schema
 * v20, `DECISIONS.md` 2026-09-25). Admin only. No figure here is shown to a buyer
 * or a developer, and none is a score of a property.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string | string[] }>;
}) {
  const session = await requirePortalRole("admin", "/admin/analytics");
  const { days: raw } = await searchParams;
  const asked = Number(Array.isArray(raw) ? raw[0] : raw);
  const days: DashboardPeriod = (
    DASHBOARD_PERIODS as readonly number[]
  ).includes(asked)
    ? (asked as DashboardPeriod)
    : 30;
  const readAt = new Date();
  const data = await loadAnalyticsDashboard(db, periodRange(days, readAt));
  const o = data.overview;
  const insights = insightsOf(data);
  const mode = recordingMode(await headers());

  return (
    <AdminShell active="analytics" email={session.email}>
      <AdminPageHeader
        title="Analytics"
        description="How buyers find, compare and choose properties. First-party, no personal details: a visitor is a random id on their own browser."
      />
      {mode !== "identified" ? (
        <p
          role="note"
          className="border-border bg-card text-foreground mb-6 rounded-lg border p-4 text-sm"
        >
          {mode === "anonymous" ? (
            <>
              <strong>This browser is recorded anonymously.</strong> It sends
              Global Privacy Control or Do Not Track, so what you click is kept
              with no visitor id and no cookie. It counts in views, comparisons
              and time, but not as a visitor, a visit or a funnel step.
            </>
          ) : (
            <>
              <strong>This browser is not recorded.</strong> It identifies
              itself as automated, and crawlers and previews are not counted as
              visitors.
            </>
          )}
        </p>
      ) : null}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <nav aria-label="Period" className="flex gap-2">
          {DASHBOARD_PERIODS.map((period) => (
            <Link
              key={period}
              href={
                period === 30
                  ? "/admin/analytics"
                  : `/admin/analytics?days=${period}`
              }
              aria-current={period === days ? "true" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                period === days
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {PERIOD_LABEL[period]}
            </Link>
          ))}
        </nav>
        <LiveRefresh readAt={readAt.toISOString()} />
      </div>

      <StatTiles
        tiles={[
          {
            label: "Visitors",
            value: String(o.visitors),
            note: `${o.visits} visits, ${o.signedInVisitors} signed in${o.eventsWithoutVisitor > 0 ? `; ${o.eventsWithoutVisitor} events with no visitor id (privacy signal)` : ""}`,
            link: { href: visitorsHref(days), label: "See the visitors" },
          },
          {
            label: "Property views",
            value: String(o.propertyViews),
            note: `median ${duration(o.medianDossierSecondsPerView)} on a property`,
            link: { href: "#properties", label: "See each property" },
          },
          {
            label: "Comparisons opened",
            value: String(o.comparisonsOpened),
            note: `${o.comparingVisitors} visitors (${percent(o.comparingVisitors, o.visitors)}), ${o.comparisonsPerComparer ?? "–"} each`,
            link: {
              href: visitorsHref(days, "reached=opened"),
              label: "See who compared",
            },
          },
          {
            label: "Time comparing",
            value: duration(o.medianCompareSecondsPerVisit),
            note: "median per visit, only while the page is in front of the buyer",
            link: { href: "#pairs", label: "See what was compared" },
          },
          {
            label: "Enquiries",
            value: String(o.enquiries),
            note: `${o.enquiriesAfterComparing} sent while comparing`,
            link: { href: "/admin/enquiries", label: "Open the enquiries" },
          },
          {
            label: "Sign-in gate",
            value: percent(data.gate.unlocked, data.gate.reached),
            note: `${data.gate.unlocked} of ${data.gate.reached} who reached a locked comparison signed in`,
            link: {
              href: visitorsHref(days, "reached=gate"),
              label: "See who reached it",
            },
          },
        ]}
      />

      <Panel
        title="What stands out"
        description="Read from the figures below. Each line opens the visitors behind it."
      >
        {insights.length === 0 ? (
          <Empty>
            Nothing stands out yet: there is too little activity in this period.
          </Empty>
        ) : (
          <ul className="divide-border divide-y">
            {insights.map((insight) => (
              <li
                key={insight.text}
                data-slot="analytics-insight"
                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-5 py-4 text-sm"
              >
                <span className="max-w-3xl">{insight.text}</span>
                {insight.query ? (
                  <Link
                    href={visitorsHref(days, insight.query)}
                    className="text-primary underline underline-offset-4"
                  >
                    See the visitors
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Visitors per day">
        <DailyTrend days={data.days} />
      </Panel>

      <Panel
        title="From visit to enquiry"
        description="Visitors who reached each step in this period, and the share kept from the step before."
      >
        <Funnel steps={data.funnel} days={days} />
      </Panel>

      <Panel
        id="pairs"
        title="Most compared against each other"
        description="Pairs of properties opened together in a comparison. Open a pair to see who compared it. Enquiries are those sent on either one while both were being compared: a sign of which one buyers chose."
      >
        {data.pairs.length === 0 ? (
          <Empty>No comparisons in this period yet.</Empty>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-border bg-muted/50 border-b">
                <th scope="col" className={th}>
                  Pair
                </th>
                <th scope="col" className={cn(th, "text-right")}>
                  Compared
                </th>
                <th scope="col" className={cn(th, "text-right")}>
                  Visitors
                </th>
                <th scope="col" className={cn(th, "text-right")}>
                  Median time
                </th>
                <th scope="col" className={th}>
                  Enquiries after comparing
                </th>
              </tr>
            </thead>
            <tbody>
              {data.pairs.map((pair) => (
                <tr
                  key={`${pair.aId}-${pair.bId}`}
                  className="border-border border-b last:border-b-0"
                >
                  <td className={td}>
                    <Link
                      href={visitorsHref(days, `pair=${pair.aId},${pair.bId}`)}
                      className="underline-offset-4 hover:underline"
                    >
                      {pair.aName}{" "}
                      <span className="text-muted-foreground">and</span>{" "}
                      {pair.bName}
                    </Link>
                  </td>
                  <td className={tdNum}>{pair.comparisons}</td>
                  <td className={tdNum}>{pair.visitors}</td>
                  <td className={tdNum}>{duration(pair.medianSeconds)}</td>
                  <td className={td}>
                    {pair.enquiriesA + pair.enquiriesB === 0
                      ? "None yet"
                      : `${pair.aName} ${pair.enquiriesA}, ${pair.bName} ${pair.enquiriesB}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel
        id="properties"
        title="Each property"
        description="Views, time on its page, how often it is added to, kept in and dropped from comparisons, what it is most often compared with, and what came of it. Open a property to see who viewed or compared it."
      >
        {data.properties.length === 0 ? (
          <Empty>No property activity in this period yet.</Empty>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-border bg-muted/50 border-b">
                <th scope="col" className={th}>
                  Property
                </th>
                <th scope="col" className={cn(th, "text-right")}>
                  Views
                </th>
                <th scope="col" className={cn(th, "text-right")}>
                  Median time
                </th>
                <th scope="col" className={cn(th, "text-right")}>
                  Added
                </th>
                <th scope="col" className={cn(th, "text-right")}>
                  Dropped
                </th>
                <th scope="col" className={cn(th, "text-right")}>
                  In comparisons
                </th>
                <th scope="col" className={th}>
                  Most compared with
                </th>
                <th scope="col" className={cn(th, "text-right")}>
                  Saves
                </th>
                <th scope="col" className={cn(th, "text-right")}>
                  Enquiries
                </th>
              </tr>
            </thead>
            <tbody>
              {data.properties.map((row) => (
                <tr
                  key={row.id}
                  className="border-border border-b last:border-b-0"
                >
                  <td className={td}>
                    <Link
                      href={visitorsHref(days, `property=${row.id}`)}
                      className="underline-offset-4 hover:underline"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className={tdNum}>
                    {row.views}{" "}
                    <span className="text-muted-foreground">
                      ({row.viewers})
                    </span>
                  </td>
                  <td className={tdNum}>
                    {duration(row.medianDossierSeconds)}
                  </td>
                  <td className={tdNum}>{row.added}</td>
                  <td className={tdNum}>{row.removed}</td>
                  <td className={tdNum}>{row.inComparisons}</td>
                  <td className={td}>
                    {row.topRival
                      ? `${row.topRival} (${row.topRivalCount})`
                      : "–"}
                  </td>
                  <td className={tdNum}>{row.saves}</td>
                  <td className={tdNum}>
                    {row.enquiries}
                    {row.enquiriesAfterComparing > 0 ? (
                      <span className="text-muted-foreground">
                        {" "}
                        ({row.enquiriesAfterComparing} comparing)
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <div className="grid gap-x-8 lg:grid-cols-2">
        <Panel title="Comparison size">
          <CountTable
            rows={data.comparisonSize}
            what="Compared at once"
            empty="No comparisons yet."
          />
        </Panel>
        <Panel title="Sections opened in a comparison">
          <CountTable
            rows={data.groupsOpened}
            what="Section"
            empty="No section opened yet."
            href={(row) =>
              row.key
                ? visitorsHref(days, `group=${encodeURIComponent(row.key)}`)
                : null
            }
          />
        </Panel>
        <Panel title="Focus chosen">
          <CountTable
            rows={data.focusChosen}
            what="Focus"
            empty="No focus chosen yet."
          />
        </Panel>
        <Panel title="Unit types switched to">
          <CountTable
            rows={data.unitSwitches}
            what="Unit type"
            empty="No unit type switched yet."
          />
        </Panel>
      </div>

      <Panel
        title="Where visitors come from"
        description="The first source of each visit: its campaign tags, else the site that linked to it."
      >
        <BreakdownTable
          rows={data.sources}
          what="Source"
          empty="No visits yet."
          href={(row) =>
            visitorsHref(days, `source=${encodeURIComponent(row.key)}`)
          }
        />
      </Panel>

      <div className="grid gap-x-8 lg:grid-cols-2">
        <Panel
          title="By budget"
          description="The band of the ceiling each visitor stated in guided intake. Never the figure."
        >
          <BreakdownTable
            rows={data.budgetBands}
            what="Budget band"
            empty="No visits yet."
            href={(row) =>
              visitorsHref(days, `band=${encodeURIComponent(row.key)}`)
            }
          />
        </Panel>
        <Panel title="By device">
          <BreakdownTable
            rows={data.devices}
            what="Device"
            empty="No visits yet."
            href={(row) =>
              visitorsHref(days, `device=${encodeURIComponent(row.key)}`)
            }
          />
        </Panel>
        <Panel title="Bedrooms asked for in intake">
          <CountTable
            rows={data.intakeBedrooms}
            what="Bedrooms"
            empty="No intake completed yet."
          />
        </Panel>
        <Panel title="Priorities chosen in intake">
          <CountTable
            rows={data.intakePriorities}
            what="Priority"
            empty="No intake completed yet."
          />
        </Panel>
      </div>
    </AdminShell>
  );
}
