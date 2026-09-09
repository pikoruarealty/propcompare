import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { DossierScreen } from "@/components/buyer/dossier-screen";
import { dossierMetadata } from "@/lib/properties/dossier";
import { assertNoExcludedData } from "@/lib/properties/no-price";
import { getPublishedPropertyBySlug } from "@/lib/properties/queries";

/**
 * `/properties/{slug}` — the buyer property dossier.
 *
 * **This page is incrementally statically regenerated.** SEO was a stated
 * reason for choosing Next.js and this is the page where it actually lives: a
 * dossier is a stable per-slug document, so serving prerendered HTML and
 * refreshing it on a window is exactly the shape of this content.
 *
 * The mechanics were checked against the Next 16 docs bundled in
 * `node_modules/next/dist/docs`, not assumed. `generateStaticParams` returns an
 * empty array deliberately: the docs state that returning an array — even an
 * empty one — is what keeps the route statically rendered, and that an empty
 * one means every path is rendered on first visit and cached thereafter rather
 * than prerendered at build. That is the property this deployment needs, since
 * prerendering the catalog at build time would require Postgres reachable
 * during `next build` (already flagged in step 3). `dynamicParams` keeps its
 * default of `true`, so a property published after the last build is served on
 * its first request instead of 404-ing until a redeploy.
 *
 * Like the browse screen, this reads the query layer directly rather than
 * fetching its own HTTP route, and keeps that route's leak guard by running
 * `assertNoExcludedData` on the dossier before it renders. See DECISIONS.md
 * (2026-09-07).
 */

/**
 * One hour. A dossier changes only when a submission is published against it,
 * which is a reviewed, human-paced event — not something worth re-rendering
 * every minute. The API's own dossier response uses a five-minute shared-cache
 * window for clients polling it directly; this is the page cache, and it can
 * afford to be longer because a publish is rare.
 */
export const revalidate = 3600;

export const generateStaticParams = async (): Promise<{ slug: string }[]> => [];

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

  return <DossierScreen dossier={assertNoExcludedData(dossier)} />;
}
