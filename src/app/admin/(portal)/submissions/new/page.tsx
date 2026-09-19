import type { Metadata } from "next";
import { db } from "@/db";
import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { BrochureUploadForm } from "@/components/admin/brochure-upload-form";
import { requirePortalRole } from "@/lib/accounts/session";
import { listDevelopers } from "@/lib/developers/profiles";

export const metadata: Metadata = {
  title: "Upload brochure — Admin console",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function UploadBrochurePage() {
  const session = await requirePortalRole("admin", "/admin/submissions/new");
  const developers = await listDevelopers(db);

  return (
    <AdminShell active="submissions" email={session.email}>
      <AdminPageHeader
        title="Upload a brochure"
        description="Start a property from a developer's brochure. You will confirm which pages matter before anything is read."
      />
      <BrochureUploadForm
        developers={developers.map(({ id, name }) => ({ id, name }))}
      />
    </AdminShell>
  );
}
