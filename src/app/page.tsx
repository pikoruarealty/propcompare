import type { Metadata } from "next";
import { db } from "@/db";
import { LandingScreen } from "@/components/buyer/landing-screen";
import { assertNoExcludedData } from "@/lib/properties/no-price";
import { listPublishedProperties } from "@/lib/properties/queries";
import { DEFAULT_SORT } from "@/lib/properties/types";

/**
 * `/` — the buyer landing page.
 *
 * Step 7 shipped this with no data access at all, which made it static; step 9
 * added the recent-properties strip that step 7 deferred, which makes it read
 * the catalog. See DECISIONS.md (2026-09-07) for why that trade was taken.
 *
 * **It is `force-dynamic`, not ISR.** A page with no dynamic segment has no
 * `generateStaticParams` escape hatch, so `export const revalidate` prerenders
 * it during `next build` and requires Postgres reachable at build time — the
 * constraint step 3 flagged and step 6 worked around by returning an empty
 * `generateStaticParams` from the dossier. That was measured rather than
 * assumed: building with an unreachable `DATABASE_URL` succeeds as written and
 * fails with `revalidate = 3600` ("Error occurred prerendering page /",
 * `ECONNREFUSED` on the listing count query). Keeping the build free of a
 * database is worth more here than the prerender: the query is one indexed
 * `order by ... limit 6`, and `s-maxage` on a reverse proxy is where repeated
 * landing traffic should be absorbed anyway, exactly as the API routes already
 * assume. `use cache` would have given a cached read without the build-time
 * dependency, but it requires enabling `cacheComponents` project-wide, which
 * changes caching semantics on every route and is not a step 9 decision.
 *
 * Like every other buyer page, this calls the read layer directly rather than
 * fetching its own HTTP route, and keeps that route's leak guard by running
 * `assertNoExcludedData` before rendering.
 */

export const dynamic = "force-dynamic";

/**
 * Six: two full rows of three on a desktop grid, one screenful on a phone. The
 * strip is a window onto the catalog, not a substitute for browsing it.
 */
const RECENT_COUNT = 6;

export const metadata: Metadata = {
  title: "PropCompare — compare Ahmedabad properties on published facts",
  description:
    "Unit areas, dimensions, amenities, specifications and possession timing for published Ahmedabad and Gujarat properties, in the same shape for every project. Reviewed before publication, with gaps stated rather than filled, and no prices.",
};

export default async function HomePage() {
  const recent = await listPublishedProperties(db, {
    page: 1,
    pageSize: RECENT_COUNT,
    sort: DEFAULT_SORT,
  });

  return <LandingScreen recent={assertNoExcludedData(recent.data)} />;
}
