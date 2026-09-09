import type { Metadata } from "next";
import { db } from "@/db";
import { IntakeScreen } from "@/components/buyer/intake-screen";
import { listFilterOptions } from "@/lib/properties/filter-options";

/**
 * `/intake` — the guided intake route.
 *
 * It reads the same `listFilterOptions` the browse filters are built from, for
 * the same reason: a question must only offer configurations and cities that
 * something published can actually match. Asking a buyer to choose a city with
 * no inventory, and then handing them an empty result set, would be the flow
 * misreporting the catalog to itself.
 *
 * That query is the page's only data dependency, and it is why the route is
 * marked `force-dynamic`. Without it the page prerenders: `listFilterOptions`
 * is a Drizzle query rather than a `fetch`, so Next.js cannot tell it is
 * uncached, and `dynamic: "auto"` renders the whole page once at build — which
 * would freeze the questions to whatever was published on build day and drift
 * from the browse filters the same query feeds. `/properties` is dynamic for
 * the same data, and the two screens offering different vocabularies would be
 * the same divergence in miniature.
 *
 * Nothing is written here and no intake session is created:
 * `POST /api/v1/intake-sessions` stays `Planned (Phase 3)`. Every answer lives
 * in client state inside `IntakeFlow` and reaches no server at all.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Guided start — PropCompare",
  description:
    "Say what matters to you, which configuration and city you are looking for, and the range you are working with. Your answers stay in your browser.",
};

export default async function IntakePage() {
  const options = await listFilterOptions(db);

  return <IntakeScreen options={options} />;
}
