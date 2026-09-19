import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { requirePortalRole } from "@/lib/accounts/session";
import { getDeveloper } from "@/lib/developers/profiles";

export const metadata: Metadata = {
  title: "Developer — Admin console",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function DeveloperDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePortalRole("admin", `/admin/developers/${id}`);
  const developer = await getDeveloper(db, id);
  if (!developer) notFound();

  return (
    <AdminShell active="developers" email={session.email}>
      <p className="mb-4 text-sm">
        <Link
          href="/admin/developers"
          className="text-muted-foreground hover:text-foreground underline underline-offset-4"
        >
          ← All developers
        </Link>
      </p>
      <AdminPageHeader
        title={developer.name}
        description="Canonical developer profile."
      />

      <dl className="border-border bg-card grid max-w-xl gap-6 rounded-lg border p-8 sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground text-xs font-semibold tracking-[0.1em] uppercase">
            RERA developer id
          </dt>
          <dd className="data-tabular mt-2">
            {developer.reraDeveloperId ?? "Not recorded"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs font-semibold tracking-[0.1em] uppercase">
            Website
          </dt>
          <dd className="mt-2 break-all">
            {developer.website ?? "Not recorded"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs font-semibold tracking-[0.1em] uppercase">
            Published properties
          </dt>
          <dd className="data-tabular mt-2">{developer.propertyCount}</dd>
        </div>
      </dl>
    </AdminShell>
  );
}
