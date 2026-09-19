import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { StatusPill } from "@/components/admin/status-pill";
import { requirePortalRole } from "@/lib/accounts/session";
import { getSubmissionDetail } from "@/lib/submissions/queue";

export const metadata: Metadata = {
  title: "Submission — Admin console",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

const display = (value: unknown): string =>
  typeof value === "string" ? value : JSON.stringify(value);

/**
 * Read-only view of a submission and its proposed fields. Reconciliation
 * (confirm / edit / reject a field) and the review and publish actions are the
 * next slice of docs/tasklists/2026-09-19-admin-portal.md; this page exists so
 * a submission can already be opened and inspected from the queue.
 */
export default async function SubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePortalRole("admin", `/admin/submissions/${id}`);
  const submission = await getSubmissionDetail(db, id);
  if (!submission) notFound();

  return (
    <AdminShell active="submissions" email={session.email}>
      <p className="mb-4 text-sm">
        <Link
          href="/admin/submissions"
          className="text-muted-foreground hover:text-foreground underline underline-offset-4"
        >
          ← Submission queue
        </Link>
      </p>
      <AdminPageHeader
        title={submission.propertyName ?? "Untitled property"}
        description={submission.developerName ?? "No developer linked"}
        action={<StatusPill status={submission.status} />}
      />

      <section aria-labelledby="fields-heading">
        <h2 id="fields-heading" className="font-display mb-4 text-2xl">
          Proposed fields
        </h2>
        {submission.fields.length === 0 ? (
          <div className="border-border bg-card rounded-lg border p-8 text-center">
            <p className="text-muted-foreground text-sm">
              No fields yet. They appear once extraction finishes or details are
              entered by hand.
            </p>
          </div>
        ) : (
          <div className="border-border bg-card overflow-x-auto rounded-lg border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-border bg-muted/50 text-muted-foreground border-b text-xs font-semibold tracking-[0.1em] uppercase">
                  <th scope="col" className="px-6 py-4">
                    Field
                  </th>
                  <th scope="col" className="px-6 py-4">
                    Value
                  </th>
                  <th scope="col" className="px-6 py-4 text-right">
                    Confidence
                  </th>
                  <th scope="col" className="px-6 py-4">
                    Review
                  </th>
                </tr>
              </thead>
              <tbody>
                {submission.fields.map((field) => (
                  <tr
                    key={field.fieldKey}
                    className="border-border border-b last:border-b-0"
                  >
                    <td className="data-tabular text-muted-foreground px-6 py-4">
                      {field.fieldKey}
                    </td>
                    <td className="px-6 py-4 break-words">
                      {display(field.value)}
                    </td>
                    <td className="data-tabular px-6 py-4 text-right">
                      {field.confidence === null
                        ? "—"
                        : `${Math.round(Number(field.confidence) * 100)}%`}
                    </td>
                    <td className="text-muted-foreground px-6 py-4">
                      {field.reviewStatus.replace(/_/g, " ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminShell>
  );
}
