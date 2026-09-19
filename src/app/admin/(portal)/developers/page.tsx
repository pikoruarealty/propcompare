import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { Button } from "@/components/ui/button";
import { requirePortalRole } from "@/lib/accounts/session";
import { listDevelopers } from "@/lib/developers/profiles";

export const metadata: Metadata = {
  title: "Developers — Admin console",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function AdminDevelopersPage() {
  const session = await requirePortalRole("admin", "/admin/developers");
  const developers = await listDevelopers(db);

  return (
    <AdminShell active="developers" email={session.email}>
      <AdminPageHeader
        title="Developers"
        description="The canonical profile for each developer. Brochures and submissions are linked to one of these."
        action={
          <Button asChild size="lg" className="h-11 px-6">
            <Link href="/admin/developers/new">Add developer</Link>
          </Button>
        }
      />

      {developers.length === 0 ? (
        <div className="border-border bg-card rounded-lg border p-10 text-center">
          <p className="font-display text-2xl">No developers yet</p>
          <p className="text-muted-foreground mx-auto mt-2 max-w-prose text-sm">
            Add the first developer profile, then link a brochure or invite
            someone from their team.
          </p>
        </div>
      ) : (
        <div className="border-border bg-card overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-border bg-muted/50 text-muted-foreground border-b text-xs font-semibold tracking-[0.1em] uppercase">
                <th scope="col" className="px-6 py-4">
                  Developer
                </th>
                <th scope="col" className="px-6 py-4">
                  RERA developer id
                </th>
                <th scope="col" className="px-6 py-4 text-right">
                  Team
                </th>
                <th scope="col" className="px-6 py-4 text-right">
                  Properties
                </th>
                <th scope="col" className="px-6 py-4 text-right">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {developers.map((developer) => (
                <tr
                  key={developer.id}
                  className="border-border border-b last:border-b-0"
                >
                  <td className="font-display px-6 py-5 text-lg">
                    {developer.name}
                  </td>
                  <td className="text-muted-foreground data-tabular px-6 py-5">
                    {developer.reraDeveloperId ?? "—"}
                  </td>
                  <td className="data-tabular px-6 py-5 text-right">
                    {developer.linkedUsers}
                  </td>
                  <td className="data-tabular px-6 py-5 text-right">
                    {developer.properties}
                  </td>
                  <td className="px-6 py-5 text-right">
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="h-8 px-3"
                    >
                      <Link href={`/admin/developers/${developer.id}`}>
                        Open
                      </Link>
                    </Button>
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
