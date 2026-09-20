import Link from "next/link";
import {
  POSSESSION_STATUS_LABEL,
  formatPossessionDate,
  propertyDossierHref,
} from "@/lib/properties/browse";
import type { PropertySummary } from "@/lib/properties/types";
import { FactValue } from "./fact-value";
import { DisplayHeading, Eyebrow } from "./typography";

/**
 * The property summary card.
 *
 * It renders exactly what `PropertySummary` carries and nothing else. That is
 * not a stylistic choice — the summary type has no price, no price-per-sqft,
 * and no bucket field, so there is nothing here that could accidentally be
 * rendered. Price restraint on this card is a property of the contract rather
 * than of this file's discipline.
 *
 * The card image is the property's primary published picture (a photo before a
 * floor plan), fetched from `/api/v1/media/{id}`. A property with no picture
 * keeps a plain neutral frame: it states nothing, because "no picture here" is
 * not a claim about the property.
 *
 * Two deliberate absences, each decided rather than overlooked:
 *
 * 1. **No verified badge.** `VerifiedBadge` refuses to render without the RERA
 *    registration number that is its evidence, and `PropertySummary` carries
 *    `reraRegistered` but not the number — only the dossier has it. So the card
 *    cannot construct a verified fact, and rather than widening the step 1
 *    contract to let a listing show a badge, the badge stays where its evidence
 *    is. See DECISIONS.md (2026-09-07).
 *
 * 2. **No save or compare action on the card itself.** Those live on the
 *    dossier and the saved and compare pages.
 *
 * Everything absent in the data renders through `FactValue`, so a property with
 * no possession date says so instead of leaving a gap the reader has to
 * interpret.
 */

export interface PropertyCardProps {
  property: PropertySummary;
}

export function PropertyCard({ property }: PropertyCardProps) {
  const headingId = `property-card-${property.id}`;
  const possessionDate = formatPossessionDate(property.possessionDate);
  const possessionStatus =
    property.possessionStatus === null
      ? null
      : POSSESSION_STATUS_LABEL[property.possessionStatus];

  return (
    <article
      data-slot="property-card"
      aria-labelledby={headingId}
      className="border-border bg-card relative flex h-full flex-col overflow-hidden rounded-lg border transition-colors focus-within:border-[var(--color-terracotta)] hover:border-[var(--color-terracotta)]"
    >
      <div
        data-slot="property-card-media"
        aria-hidden={property.primaryMedia ? undefined : true}
        className="bg-muted border-border relative aspect-[4/3] w-full overflow-hidden border-b"
      >
        {property.primaryMedia ? (
          // Served through the media route (a fresh short-lived link per request),
          // never by storage path.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/v1/media/${property.primaryMedia.id}`}
            alt={`${property.name}, ${property.locality}`}
            loading="lazy"
            className={
              property.primaryMedia.mediaType === "floor_plan"
                ? "size-full object-contain"
                : "size-full object-cover"
            }
          />
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="flex flex-col gap-1">
          <Eyebrow>{property.propertyType.label}</Eyebrow>
          <DisplayHeading level={3} id={headingId}>
            {/*
             * The name is the card's only link, stretched over the whole card
             * so the entire surface is clickable without adding a second link
             * to the same destination for a screen reader to read twice.
             */}
            <Link
              href={propertyDossierHref(property.slug)}
              className="after:absolute after:inset-0 after:content-['']"
            >
              {property.name}
            </Link>
          </DisplayHeading>
          <p className="text-muted-foreground text-sm">
            {property.developer.name}
          </p>
        </div>

        <p className="text-foreground text-sm">
          {property.locality}, {property.city}
        </p>

        <dl className="mt-auto flex flex-col gap-2 text-sm">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <dt className="text-muted-foreground">Configuration</dt>
            <dd className="flex flex-wrap gap-1.5">
              {property.bhkTypes.length === 0 ? (
                <FactValue status="not_stated" />
              ) : (
                property.bhkTypes.map((bhk) => (
                  <span
                    key={bhk.key}
                    data-slot="property-card-bhk"
                    className="border-border bg-accent text-accent-foreground rounded-full border px-2 py-0.5 text-xs"
                  >
                    {bhk.label}
                  </span>
                ))
              )}
            </dd>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-2">
            <dt className="text-muted-foreground">Possession</dt>
            <dd>
              <FactValue value={possessionStatus} />
            </dd>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-2">
            <dt className="text-muted-foreground">Possession date</dt>
            <dd>
              <FactValue value={possessionDate} tabular />
            </dd>
          </div>
        </dl>
      </div>
    </article>
  );
}
