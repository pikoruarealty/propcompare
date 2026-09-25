import { and, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { analyticsEvents } from "@/db/schema/analytics";
import { properties } from "@/db/schema/catalog";
import { isListed } from "@/lib/properties/visibility";
import { referrerDomainOf, type EventInput } from "./events";

/**
 * Stores one checked event. Slugs are resolved to listed properties here, so an
 * event about a property that is not (or no longer) listed keeps no id, and a
 * made-up slug records nothing about any property. Returns false when the event
 * needed a property and none resolved.
 */
export const recordEvent = async (
  db: PostgresJsDatabase,
  input: EventInput,
  context: {
    visitorId: string;
    sessionId: string;
    signedIn: boolean;
    device: string;
    ownHost: string | null;
  },
): Promise<boolean> => {
  const wanted = [
    ...new Set([...(input.slug ? [input.slug] : []), ...input.slugs]),
  ];
  const found =
    wanted.length === 0
      ? []
      : await db
          .select({ id: properties.id, slug: properties.slug })
          .from(properties)
          .where(and(inArray(properties.slug, wanted), isListed));
  const idOf = new Map(found.map((row) => [row.slug, row.id]));

  const propertyId = input.slug ? (idOf.get(input.slug) ?? null) : null;
  if (input.slug && propertyId === null) return false;
  const comparedIds = input.slugs
    .map((slug) => idOf.get(slug))
    .filter((id): id is string => id !== undefined);

  await db.insert(analyticsEvents).values({
    visitorId: context.visitorId,
    sessionId: context.sessionId,
    event: input.event,
    signedIn: context.signedIn,
    propertyId,
    comparedIds: comparedIds.length > 0 ? comparedIds : null,
    engagedMs: input.engagedMs,
    detail: input.detail,
    device: context.device,
    source: input.utm.source,
    medium: input.utm.medium,
    campaign: input.utm.campaign,
    referrerDomain: referrerDomainOf(input.referrer, context.ownHost),
    budgetBand: input.budgetBand,
  });
  return true;
};
