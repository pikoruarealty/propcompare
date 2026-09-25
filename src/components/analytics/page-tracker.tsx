"use client";

import { useEngagedTime, useTrackOnce } from "@/lib/analytics/use-tracking";

/**
 * A property's page view and the time it is in front of the buyer, for a page that
 * is otherwise drawn on the server (the dossier). Draws nothing.
 */
export function DossierTracker({ slug }: { slug: string }) {
  useTrackOnce("property_viewed", { slug }, slug);
  useEngagedTime("dossier", { slug }, slug);
  return null;
}
