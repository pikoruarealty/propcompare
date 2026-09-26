import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { duration } from "@/components/admin/analytics/panels";
import { requirePortalRole } from "@/lib/accounts/session";
import { isUuid, loadJourney } from "@/lib/analytics/visitors";

export const metadata: Metadata = {
  title: "Visitor | Admin console",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

const dateTime = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});
const clock = new Intl.DateTimeFormat("en-IN", {
  timeStyle: "medium",
  timeZone: "Asia/Kolkata",
});

/**
 * What one browser did, in order and in words, grouped by visit. The browser is
 * known only by a random id: this page holds nothing that names a person, and no
 * account is looked up (`DECISIONS.md` 2026-09-26).
 */
export default async function VisitorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const session = await requirePortalRole(
    "admin",
    `/admin/analytics/visitors/${id}`,
  );
  const journey = await loadJourney(db, id.toLowerCase());
  if (!journey) notFound();

  return (
    <AdminShell active="analytics" email={session.email}>
      <AdminPageHeader
        title={journey.label}
        description={`${journey.visits.length} ${journey.visits.length === 1 ? "visit" : "visits"}, first seen ${dateTime.format(new Date(journey.firstSeen))}, last seen ${dateTime.format(new Date(journey.lastSeen))}. One browser, told apart by a random id: nothing here names a person.`}
        action={
          <Link
            href="/admin/analytics/visitors"
            className="text-primary text-sm underline underline-offset-4"
          >
            All visitors
          </Link>
        }
      />

      <dl
        data-slot="visitor-summary"
        className="border-border bg-card mb-8 grid gap-x-8 gap-y-4 rounded-lg border p-5 text-sm sm:grid-cols-2 lg:grid-cols-4"
      >
        {[
          ["Device", journey.device],
          ["Came from", journey.source ?? "Direct"],
          ["Signed in", journey.signedIn ? "Yes, at some point" : "No"],
          ["Budget band stated", journey.budgetBand ?? "Not stated"],
          ["Time on pages", duration(journey.engagedSeconds)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground text-xs font-semibold tracking-[0.1em] uppercase">
              {label}
            </dt>
            <dd className="mt-1">{value}</dd>
          </div>
        ))}
      </dl>

      {journey.visits.map((visit, index) => (
        <section
          key={visit.sessionId}
          data-slot="visitor-visit"
          className="mb-8"
        >
          <h2 className="font-display text-2xl">
            Visit {index + 1}
            <span className="text-muted-foreground font-sans text-base">
              {" "}
              · {dateTime.format(new Date(visit.startedAt))}
            </span>
          </h2>
          <ol className="border-border bg-card divide-border mt-3 divide-y rounded-lg border">
            {visit.events.map((event, at) => (
              <li
                key={`${event.at}-${at}`}
                className="grid grid-cols-[6rem_1fr] gap-4 px-5 py-3 text-sm"
              >
                <time
                  dateTime={event.at}
                  className="text-muted-foreground data-tabular"
                >
                  {clock.format(new Date(event.at))}
                </time>
                {event.href ? (
                  <Link
                    href={event.href}
                    className="underline-offset-4 hover:underline"
                  >
                    {event.text}
                  </Link>
                ) : (
                  <span>{event.text}</span>
                )}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </AdminShell>
  );
}
