import type { Metadata } from "next";
import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { DeveloperForm } from "@/components/admin/developer-form";
import { createDeveloperAction } from "@/app/actions/admin-developers";
import { requirePortalRole } from "@/lib/accounts/session";

export const metadata: Metadata = {
  title: "Add developer — Admin console",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function NewDeveloperPage() {
  const session = await requirePortalRole("admin", "/admin/developers/new");

  return (
    <AdminShell active="developers" email={session.email}>
      <AdminPageHeader
        title="Add developer"
        description="Create the one canonical profile for a developer. It does not need an account — you can invite their team afterwards."
      />
      <DeveloperForm action={createDeveloperAction} />
    </AdminShell>
  );
}
