import type { Metadata } from "next";
import { db } from "@/db";
import { CompareEmpty, CompareScreen } from "@/components/buyer/compare-screen";
import {
  PageContainer,
  PageFrame,
  PageSection,
} from "@/components/buyer/page-frame";
import { MAX_COMPARED } from "@/lib/compare/model";
import { assertNoExcludedData } from "@/lib/properties/no-price";
import { getPublishedPropertyBySlug } from "@/lib/properties/queries";
import type { PropertyDossier } from "@/lib/properties/types";

/**
 * `/compare?p=slug-a,slug-b[,…]&v=slug~unitTypeId[,…]` — the comparison, which is
 * the product (`docs/design/comparison.v1.md`). The address is the whole state, so
 * a comparison is shareable and needs no sign-in. Properties that are not
 * published any more (unlisted, deleted, unknown) are simply left out, and the
 * page says how many.
 *
 * Read fresh on every request: a comparison is made of whichever properties the
 * address names, so there is nothing sensible to prerender.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Compare properties — PropCompare",
  robots: { index: false },
};

const SLUG = /^[a-z0-9][a-z0-9-]{0,120}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const first = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value) ?? "";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string | string[]; v?: string | string[] }>;
}) {
  const { p, v } = await searchParams;

  const slugs = [
    ...new Set(
      first(p)
        .split(",")
        .map((slug) => slug.trim().toLowerCase())
        .filter((slug) => SLUG.test(slug)),
    ),
  ].slice(0, MAX_COMPARED);

  const requested: Record<string, string> = {};
  for (const pair of first(v).split(",")) {
    const [slug, id] = pair.split("~");
    if (slug && id && UUID.test(id) && slugs.includes(slug))
      requested[slug] = id;
  }

  const found = (
    await Promise.all(slugs.map((slug) => getPublishedPropertyBySlug(db, slug)))
  ).filter((dossier): dossier is PropertyDossier => dossier !== null);
  const unavailable = slugs.length - found.length;

  return (
    <PageFrame>
      <PageContainer>
        <PageSection>
          {unavailable > 0 ? (
            <p
              role="status"
              data-slot="compare-unavailable"
              className="border-border bg-muted mb-6 rounded-md border p-3 text-sm"
            >
              {unavailable === 1
                ? "One property in this link is no longer available and was left out."
                : `${unavailable} properties in this link are no longer available and were left out.`}
            </p>
          ) : null}
          {found.length >= 2 ? (
            <CompareScreen
              dossiers={assertNoExcludedData(found)}
              requested={requested}
            />
          ) : (
            <CompareEmpty found={found.length} />
          )}
        </PageSection>
      </PageContainer>
    </PageFrame>
  );
}
