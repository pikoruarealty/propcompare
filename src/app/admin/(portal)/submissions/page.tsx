import type { Metadata } from "next";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { db } from "@/db";
import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { StatusPill } from "@/components/admin/status-pill";
import { SubmissionRowActions } from "@/components/admin/submission-row-actions";
import { Button } from "@/components/ui/button";
import { requirePortalRole } from "@/lib/accounts/session";
import { listFailingReraChecks } from "@/lib/rera/health";
import {
  isSubmissionStatus,
  listSubmissionQueue,
  SUBMISSION_STATUS_LABEL,
  type SubmissionStatus,
} from "@/lib/submissions/queue";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Submissions — Admin console",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });

const FILTERS: { key: SubmissionStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  ...(
    [
      "submitted",
      "in_review",
      "changes_requested",
      "approved",
      "draft",
      "published",
      "rejected",
    ] as const
  ).map((key) => ({ key, label: SUBMISSION_STATUS_LABEL[key] })),
];

export default async function SubmissionQueuePage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string | string[];
    view?: string | string[];
  }>;
}) {
  const session = await requirePortalRole("admin", "/admin/submissions");
  const { status: rawStatus, view: rawView } = await searchParams;
  const candidate = Array.isArray(rawStatus) ? rawStatus[0] : rawStatus;
  const archived =
    (Array.isArray(rawView) ? rawView[0] : rawView) === "archived";
  // The archived view lists every archived submission whatever its status.
  const status =
    !archived && isSubmissionStatus(candidate) ? candidate : undefined;
  const isOwner = session.role.permissionLevel === "owner";
  const submissions = await listSubmissionQueue(db, { status, archived });
  const failingChecks = await listFailingReraChecks(db);

  return (
    <AdminShell active="submissions" email={session.email}>
      <AdminPageHeader
        title="Submission queue"
        description="Every property draft, from brochure or manual entry, on its way to the catalog."
        action={
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline" size="lg" className="h-11 px-6">
              <Link href="/admin/submissions/manual">Add manually</Link>
            </Button>
            <Button asChild size="lg" className="h-11 px-6">
              <Link href="/admin/submissions/new">Upload brochure</Link>
            </Button>
          </div>
        }
      />

      {failingChecks.length > 0 ? (
        <section
          role="alert"
          data-slot="rera-failing"
          className="border-destructive/40 mb-6 rounded-lg border p-4 text-sm"
        >
          <p className="text-destructive font-medium">
            RERA checks are failing for {failingChecks.length}{" "}
            {failingChecks.length === 1 ? "property" : "properties"}.
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {failingChecks.map((check) => (
              <li key={check.propertyId}>
                {check.submissionId ? (
                  <Link
                    href={`/admin/submissions/${check.submissionId}`}
                    className="text-primary underline underline-offset-4"
                  >
                    {check.propertyName}
                  </Link>
                ) : (
                  check.propertyName
                )}
                : {check.consecutiveFailures} failed in a row
                {check.lastError ? ` (${check.lastError})` : ""}; last worked{" "}
                {check.lastSuccessAt
                  ? dateFormat.format(check.lastSuccessAt)
                  : "never"}
                .
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <nav aria-label="Filter by status" className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map(({ key, label }) => {
          const active = !archived && (status ?? "all") === key;
          return (
            <Link
              key={key}
              href={
                key === "all"
                  ? "/admin/submissions"
                  : `/admin/submissions?status=${key}`
              }
              aria-current={active ? "true" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </Link>
          );
        })}
        <Link
          href="/admin/submissions?view=archived"
          aria-current={archived ? "true" : undefined}
          className={cn(
            "ml-auto rounded-full border px-3 py-1 text-sm transition-colors",
            archived
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          Archived
        </Link>
      </nav>

      {submissions.length === 0 ? (
        <div className="border-border bg-card rounded-lg border p-10 text-center">
          <p className="font-display text-2xl">
            {archived
              ? "Nothing archived"
              : status
                ? "Nothing with that status"
                : "No submissions yet"}
          </p>
          <p className="text-muted-foreground mx-auto mt-2 max-w-prose text-sm">
            {archived
              ? "A published submission you archive is kept here, and can be restored."
              : status
                ? "Try another filter, or clear it to see everything."
                : "Submissions appear here once a brochure is uploaded or a property is entered by hand."}
          </p>
        </div>
      ) : (
        <div className="border-border bg-card overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-border bg-muted/50 text-muted-foreground border-b text-xs font-semibold tracking-[0.1em] uppercase">
                <th scope="col" className="px-6 py-4">
                  Property &amp; developer
                </th>
                <th scope="col" className="px-6 py-4">
                  Location
                </th>
                <th scope="col" className="px-6 py-4">
                  Change
                </th>
                <th scope="col" className="px-6 py-4">
                  Date
                </th>
                <th scope="col" className="px-6 py-4">
                  Status
                </th>
                <th scope="col" className="px-6 py-4 text-right">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((submission) => (
                <tr
                  key={submission.id}
                  className="border-border border-b last:border-b-0"
                >
                  <td className="px-6 py-5">
                    <p className="font-display text-lg leading-tight">
                      {submission.propertyName ?? "Untitled property"}
                    </p>
                    <p className="text-muted-foreground mt-1">
                      {submission.developerName ?? "No developer linked"}
                    </p>
                  </td>
                  <td className="text-muted-foreground px-6 py-5">
                    {submission.city || submission.locality ? (
                      <span className="inline-flex items-center gap-2">
                        <MapPin
                          className="size-4 shrink-0"
                          aria-hidden="true"
                        />
                        {[submission.locality, submission.city]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    ) : (
                      "Not stated"
                    )}
                  </td>
                  <td className="px-6 py-5">
                    <p data-slot="change-type">
                      {submission.isEdit
                        ? "Update to a live listing"
                        : "New listing"}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {submission.source === "ocr_brochure"
                        ? "From a brochure"
                        : submission.source === "manual_form"
                          ? "Entered manually"
                          : "From RERA"}
                    </p>
                  </td>
                  <td className="data-tabular px-6 py-5">
                    {dateFormat.format(
                      submission.submittedAt ?? submission.createdAt,
                    )}
                  </td>
                  <td className="px-6 py-5">
                    <StatusPill status={submission.status} />
                    {submission.listingStatus === "unlisted" ||
                    submission.listingStatus === "deleted" ? (
                      <p
                        data-slot="listing-note"
                        className="text-destructive mt-1.5 text-xs font-medium"
                      >
                        {submission.listingStatus === "deleted"
                          ? "Deleted: hidden from buyers"
                          : "Unlisted: hidden from buyers"}
                      </p>
                    ) : null}
                    {submission.isEdit && submission.status !== "published" ? (
                      <p
                        data-slot="live-note"
                        className="text-muted-foreground mt-1.5 text-xs"
                      >
                        Current listing stays live
                      </p>
                    ) : null}
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {isOwner ? (
                        <SubmissionRowActions
                          submissionId={submission.id}
                          propertyName={
                            submission.propertyName ?? "this submission"
                          }
                          published={submission.status === "published"}
                          archived={archived}
                        />
                      ) : null}
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="h-8 px-3"
                      >
                        <Link href={`/admin/submissions/${submission.id}`}>
                          Open
                        </Link>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
