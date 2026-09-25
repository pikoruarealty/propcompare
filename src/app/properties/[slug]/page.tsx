import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { DossierScreen } from "@/components/buyer/dossier-screen";
import { dossierMetadata } from "@/lib/properties/dossier";
import { hasBuyerPageSession } from "@/lib/buyer/page-session";
import { lockDossier } from "@/lib/properties/lock";
import { assertNoExcludedData } from "@/lib/properties/no-price";
import { getPublishedPropertyBySlug } from "@/lib/properties/queries";

/**
 * `/properties/{slug}` — the buyer property dossier.
 *
 * **This page is rendered per request, not statically regenerated.** It used to
 * be incrementally statically regenerated for SEO. Since 2026-09-24 the
 * configurations, amenities, floor plans and most photos are behind sign-in
 * (`DECISIONS.md`), and what the server sends depends on the visitor's session,
 * so one cached copy cannot serve both. A signed-out request is handed
 * `lockDossier(dossier)`; only a signed-in one gets the full record. The HTML is
 * still server-rendered, so a crawler reads the open part (identity, possession,
 * RERA, specifications, location, developer) as before.
 *
 * Like the browse screen, this reads the query layer directly rather than
 * fetching its own HTTP route, and keeps that route's leak guard by running
 * `assertNoExcludedData` on the dossier before it renders. See DECISIONS.md
 * (2026-09-07).
 */
export const dynamic = "force-dynamic";

export const generateMetadata = async ({
  params,
}: PageProps<"/properties/[slug]">): Promise<Metadata> => {
  const { slug } = await params;
  const dossier = await getPublishedPropertyBySlug(db, slug);

  // A slug with no property gets no invented title. The page itself will 404.
  if (dossier === null) return { title: "Property not found — PropCompare" };

  const { title, description } = dossierMetadata(dossier);
  return { title, description };
};

export default async function PropertyDossierPage({
  params,
}: PageProps<"/properties/[slug]">) {
  const { slug } = await params;
  const dossier = await getPublishedPropertyBySlug(db, slug);

  // The read layer returns null rather than throwing, so "no such published
  // property" stays a routing outcome instead of a server error.
  if (dossier === null) notFound();

  const signedIn = await hasBuyerPageSession();
  return (
    <DossierScreen
      dossier={assertNoExcludedData(signedIn ? dossier : lockDossier(dossier))}
    />
  );
}
