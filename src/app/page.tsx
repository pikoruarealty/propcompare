import type { Metadata } from "next";
import { LandingScreen } from "@/components/buyer/landing-screen";

/**
 * `/` — the buyer landing page.
 *
 * No route segment config and no data access, so this prerenders at build as
 * static HTML. That is the point: it is the most-visited page in the product
 * and nothing on it varies by request, visitor, or catalog state. See
 * DECISIONS.md (2026-09-07).
 *
 * This replaces the `create-next-app` scaffold that had survived since Phase 0.
 */

export const metadata: Metadata = {
  title: "PropCompare — compare Ahmedabad properties on published facts",
  description:
    "Unit areas, dimensions, amenities, specifications and possession timing for published Ahmedabad and Gujarat properties, in the same shape for every project. Reviewed before publication, with gaps stated rather than filled, and no prices.",
};

export default function HomePage() {
  return <LandingScreen />;
}
