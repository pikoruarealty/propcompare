import type { Metadata } from "next";
import { db } from "@/db";
import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { ManualSubmissionForm } from "@/components/admin/manual-submission-form";
import { requirePortalRole } from "@/lib/accounts/session";
import { listDevelopers } from "@/lib/developers/profiles";

export const metadata: Metadata = {
  title: "Add property manually — Admin console",
  robots: { index: false },
};
export const dynamic = "force-dynamic";

export default async function ManualSubmissionPage() {
  const session = await requirePortalRole("admin", "/admin/submissions/manual");
  const developers = await listDevelopers(db);
  return (
    <AdminShell active="submissions" email={session.email}>
      <AdminPageHeader
        title="Add a property manually"
        description="Start a reviewable draft when no brochure is available. Nothing is published until the normal review and owner approval steps finish."
      />
      <ManualSubmissionForm
        developers={developers.map(({ id, name }) => ({ id, name }))}
      />
    </AdminShell>
  );
}
