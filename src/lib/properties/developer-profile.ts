import { and, desc, eq } from "drizzle-orm";
import { developers, properties } from "@/db/schema/catalog";
import { loadPropertySummariesByIds, type ReadDb } from "./queries";
import type { PropertySummary } from "./types";
import { isListed } from "./visibility";

/**
 * A developer as a buyer may see it: the profile and the published projects it
 * stands behind. Developer names are not unique (two companies can share one), so
 * this page is how a buyer tells them apart: by id, with their own projects.
 * Only listed properties appear; nothing private (legal entities, RERA promoter
 * numbers held for admin use) is read here.
 */
export interface PublicDeveloper {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  properties: PropertySummary[];
}

export const getPublicDeveloper = async (
  db: ReadDb,
  id: string,
): Promise<PublicDeveloper | null> => {
  const [developer] = await db
    .select({
      id: developers.id,
      name: developers.name,
      description: developers.description,
      website: developers.website,
    })
    .from(developers)
    .where(eq(developers.id, id));
  if (!developer) return null;

  const owned = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.developerId, id), isListed))
    .orderBy(desc(properties.createdAt));
  const summaries = await loadPropertySummariesByIds(
    db,
    owned.map((row) => row.id),
  );

  return {
    ...developer,
    properties: owned
      .map((row) => summaries.get(row.id))
      .filter((summary): summary is PropertySummary => summary !== undefined),
  };
};
