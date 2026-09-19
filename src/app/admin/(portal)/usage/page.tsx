import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { requirePortalRole } from "@/lib/accounts/session";
import {
  daysAgo,
  getRecentUsage,
  getUsageByDeveloper,
  getUsageByModel,
  getUsageBySubmission,
  getUsageTotals,
  type UsageTotals,
} from "@/lib/usage/ledger";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Usage — Admin console",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const dateTime = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

const RANGES = [
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "all", label: "All time", days: null },
] as const;

/** A total is a lower bound while any request in it has no reported cost. */
function Amount({ totals }: { totals: UsageTotals }) {
  return (
    <span className="data-tabular">
      {totals.unreportedCount > 0 ? "≥ " : ""}
      {usd.format(totals.costUsd)}
    </span>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="font-display mb-4 text-2xl">{title}</h2>
      <div className="border-border bg-card overflow-x-auto rounded-lg border">
        {children}
      </div>
    </section>
  );
}

const th =
  "px-6 py-4 text-xs font-semibold tracking-[0.1em] uppercase text-muted-foreground";

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[] }>;
}) {
  // Admin only. A developer or buyer session is redirected to the admin login,
  // and no developer-facing code path reads the ledger (see the isolation test).
  const session = await requirePortalRole("admin", "/admin/usage");
  const { range: rawRange } = await searchParams;
  const range =
    RANGES.find(
      (r) => r.key === (Array.isArray(rawRange) ? rawRange[0] : rawRange),
    ) ?? RANGES[0];
  const since = range.days === null ? undefined : daysAgo(range.days);

  const [totals, bySubmission, byDeveloper, byModel, recent] =
    await Promise.all([
      getUsageTotals(db, since),
      getUsageBySubmission(db, since),
      getUsageByDeveloper(db, since),
      getUsageByModel(db, since),
      getRecentUsage(db),
    ]);

  return (
    <AdminShell active="usage" email={session.email}>
      <AdminPageHeader
        title="Usage"
        description="What each AI run cost, by brochure, developer and model. Visible to admins only."
      />

      <nav aria-label="Period" className="mb-6 flex gap-2">
        {RANGES.map((r) => (
          <Link
            key={r.key}
            href={
              r.key === "30d" ? "/admin/usage" : `/admin/usage?range=${r.key}`
            }
            aria-current={r.key === range.key ? "true" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              r.key === range.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {r.label}
          </Link>
        ))}
      </nav>

      <dl className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Total spend", value: <Amount totals={totals} /> },
          {
            label: "Requests",
            value: <span className="data-tabular">{totals.requests}</span>,
          },
          {
            label: "Failed requests",
            value: <span className="data-tabular">{totals.failedCount}</span>,
          },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="border-border bg-card rounded-lg border p-6"
          >
            <dt className="text-muted-foreground text-xs font-semibold tracking-[0.1em] uppercase">
              {label}
            </dt>
            <dd className="font-display mt-2 text-3xl">{value}</dd>
          </div>
        ))}
      </dl>
      {totals.unreportedCount > 0 ? (
        <p className="text-muted-foreground mt-3 text-sm">
          {totals.unreportedCount} request
          {totals.unreportedCount === 1 ? "" : "s"} did not report a cost, so
          totals marked ≥ are a lower bound. Costs are never estimated.
        </p>
      ) : null}

      <Panel title="By brochure">
        {bySubmission.length === 0 ? (
          <p className="text-muted-foreground p-8 text-center text-sm">
            No AI runs recorded in this period.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-border bg-muted/50 border-b">
                <th scope="col" className={th}>
                  Property &amp; developer
                </th>
                <th scope="col" className={cn(th, "text-right")}>
                  Requests
                </th>
                <th scope="col" className={cn(th, "text-right")}>
                  Cost
                </th>
                <th scope="col" className={th}>
                  Last run
                </th>
              </tr>
            </thead>
            <tbody>
              {bySubmission.map((row) => (
                <tr
                  key={row.submissionId ?? "none"}
                  className="border-border border-b last:border-b-0"
                >
                  <td className="px-6 py-4">
                    {row.submissionId ? (
                      <Link
                        href={`/admin/submissions/${row.submissionId}`}
                        className="font-display text-lg underline-offset-4 hover:underline"
                      >
                        {row.propertyName ?? "Untitled property"}
                      </Link>
                    ) : (
                      <span className="font-display text-lg">
                        Deleted draft
                      </span>
                    )}
                    <p className="text-muted-foreground mt-1">
                      {row.developerName ?? "No developer linked"}
                    </p>
                  </td>
                  <td className="data-tabular px-6 py-4 text-right">
                    {row.requests}
                    {row.failedCount > 0 ? ` (${row.failedCount} failed)` : ""}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Amount totals={row} />
                  </td>
                  <td className="text-muted-foreground px-6 py-4">
                    {dateTime.format(row.lastAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="By developer">
        {byDeveloper.length === 0 ? (
          <p className="text-muted-foreground p-8 text-center text-sm">
            Nothing recorded yet.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-border bg-muted/50 border-b">
                <th scope="col" className={th}>
                  Developer
                </th>
                <th scope="col" className={cn(th, "text-right")}>
                  Requests
                </th>
                <th scope="col" className={cn(th, "text-right")}>
                  Cost
                </th>
              </tr>
            </thead>
            <tbody>
              {byDeveloper.map((row) => (
                <tr
                  key={row.key}
                  className="border-border border-b last:border-b-0"
                >
                  <td className="font-display px-6 py-4 text-lg">
                    {row.label}
                  </td>
                  <td className="data-tabular px-6 py-4 text-right">
                    {row.requests}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Amount totals={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="By model">
        {byModel.length === 0 ? (
          <p className="text-muted-foreground p-8 text-center text-sm">
            Nothing recorded yet.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-border bg-muted/50 border-b">
                <th scope="col" className={th}>
                  Model
                </th>
                <th scope="col" className={cn(th, "text-right")}>
                  Requests
                </th>
                <th scope="col" className={cn(th, "text-right")}>
                  Cost
                </th>
              </tr>
            </thead>
            <tbody>
              {byModel.map((row) => (
                <tr
                  key={row.key}
                  className="border-border border-b last:border-b-0"
                >
                  <td className="data-tabular px-6 py-4">{row.label}</td>
                  <td className="data-tabular px-6 py-4 text-right">
                    {row.requests}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Amount totals={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Recent requests">
        {recent.length === 0 ? (
          <p className="text-muted-foreground p-8 text-center text-sm">
            Nothing recorded yet.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-border bg-muted/50 border-b">
                <th scope="col" className={th}>
                  When
                </th>
                <th scope="col" className={th}>
                  What
                </th>
                <th scope="col" className={th}>
                  Developer
                </th>
                <th scope="col" className={cn(th, "text-right")}>
                  Tokens
                </th>
                <th scope="col" className={cn(th, "text-right")}>
                  Cost
                </th>
              </tr>
            </thead>
            <tbody>
              {recent.map((row) => (
                <tr
                  key={row.id}
                  className="border-border border-b last:border-b-0"
                >
                  <td className="text-muted-foreground px-6 py-4">
                    {dateTime.format(row.createdAt)}
                  </td>
                  <td className="px-6 py-4">
                    {row.kind === "page_router"
                      ? "Categorize pages"
                      : `Extraction${row.scopeKey ? ` · ${row.scopeKey}` : ""}`}
                    {row.status === "failed" ? (
                      <span className="text-destructive ml-2 text-xs">
                        failed
                      </span>
                    ) : null}
                  </td>
                  <td className="text-muted-foreground px-6 py-4">
                    {row.developerName ?? "—"}
                  </td>
                  <td className="data-tabular px-6 py-4 text-right">
                    {row.promptTokens === null && row.completionTokens === null
                      ? "—"
                      : `${row.promptTokens ?? 0} in · ${row.completionTokens ?? 0} out`}
                  </td>
                  <td className="data-tabular px-6 py-4 text-right">
                    {row.costUsd === null
                      ? "not reported"
                      : usd.format(row.costUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </AdminShell>
  );
}
