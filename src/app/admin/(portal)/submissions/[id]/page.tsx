import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { StatusPill } from "@/components/admin/status-pill";
import { SubmissionWorkbench } from "@/components/admin/submission-workbench";
import { requirePortalRole } from "@/lib/accounts/session";
import { getSubmissionDetail } from "@/lib/submissions/queue";

export const metadata: Metadata = {
  title: "Submission — Admin console",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

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
          Back to submission queue
        </Link>
      </p>
      <AdminPageHeader
        title={submission.propertyName ?? "Untitled property"}
        description={submission.developerName ?? "No developer linked"}
        action={<StatusPill status={submission.status} />}
      />
      <SubmissionWorkbench
        submission={submission}
        permissionLevel={session.role.permissionLevel}
      />
    </AdminShell>
  );
}
