import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { PageReview } from "@/components/admin/page-review";
import { requirePortalRole } from "@/lib/accounts/session";
import { readStoredSuggestions } from "@/lib/ingestion/page-suggestions";
import { getSubmissionBrochure } from "@/lib/ingestion/queries";
import { storageAdapter } from "@/lib/storage";

export const metadata: Metadata = {
  title: "Review brochure pages — Admin console",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/** How long the brochure link stays valid while the admin works on the pages. */
const PDF_URL_TTL_SECONDS = 60 * 60;

export default async function ReviewPagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePortalRole(
    "admin",
    `/admin/submissions/${id}/pages`,
  );
  const brochure = await getSubmissionBrochure(db, id);
  if (!brochure) notFound();

  const suggestions = readStoredSuggestions(brochure.routingManifest);
  const pdfUrl = await storageAdapter.getSignedReadUrl(brochure.storagePath, {
    expiresInSeconds: PDF_URL_TTL_SECONDS,
  });

  return (
    <AdminShell active="submissions" email={session.email}>
      <p className="mb-4 text-sm">
        <Link
          href={`/admin/submissions/${id}`}
          className="text-muted-foreground hover:text-foreground underline underline-offset-4"
        >
          ← Submission
        </Link>
      </p>
      <AdminPageHeader
        title="Review brochure pages"
        description={`${brochure.developerName ?? "Unknown developer"} · ${brochure.pageCount} pages`}
      />
      <PageReview
        key={suggestions?.generatedAt ?? "none"}
        pdfUrl={pdfUrl}
        pageCount={brochure.pageCount}
        ocrJobId={brochure.ocrJobId}
        suggestions={suggestions?.pages ?? null}
      />
    </AdminShell>
  );
}
