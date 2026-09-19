import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import {
  PageReview,
  type ConfirmedPageChoice,
} from "@/components/admin/page-review";
import { requirePortalRole } from "@/lib/accounts/session";
import { readStoredSuggestions } from "@/lib/ingestion/page-suggestions";
import { getSubmissionBrochure } from "@/lib/ingestion/queries";
import { storageAdapter } from "@/lib/storage";
import { parseOcrRoutingManifest } from "@/lib/ocr/routing";

export const metadata: Metadata = {
  title: "Review brochure pages — Admin console",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/** How long the brochure link stays valid while the admin works on the pages. */
const PDF_URL_TTL_SECONDS = 60 * 60;

const readConfirmedChoices = (
  manifest: unknown,
  pageCount: number,
): ConfirmedPageChoice[] | null => {
  try {
    const parsed = parseOcrRoutingManifest(manifest, pageCount);
    return parsed.scopes.flatMap((scope) => {
      const category =
        scope.kind === "property_details"
          ? "project_details"
          : scope.kind === "floor_plans" || scope.kind === "unit_variant"
            ? "floor_plan"
            : scope.kind;
      return scope.pages.map((page) => ({
        pageNumber: page.pageNumber,
        category,
      }));
    }) as ConfirmedPageChoice[];
  } catch {
    return null;
  }
};

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
  const confirmedChoices = readConfirmedChoices(
    brochure.routingManifest,
    brochure.pageCount,
  );
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
        submissionId={brochure.submissionId}
        key={
          brochure.ocrJobStatus +
          (confirmedChoices
            ?.map((choice) => choice.pageNumber + choice.category)
            .join(",") ??
            suggestions?.generatedAt ??
            "none")
        }
        pdfUrl={pdfUrl}
        pageCount={brochure.pageCount}
        ocrJobId={brochure.ocrJobId}
        ocrJobStatus={brochure.ocrJobStatus}
        suggestions={suggestions?.pages ?? null}
        confirmedChoices={confirmedChoices}
      />
    </AdminShell>
  );
}
