import Link from "next/link";
import {
  BROWSE_PATH,
  POSSESSION_STATUS_LABEL,
  formatPossessionDate,
} from "@/lib/properties/browse";
import {
  AREA_BASIS_LABEL,
  AREA_BASIS_ORDER,
  areasByBasis,
  dossierJsonLd,
  formatAreaRange,
  formatPercent,
  formatRoomDimension,
  formatSqft,
  groupByCategory,
  humaniseCategory,
  readRoomDimensions,
} from "@/lib/properties/dossier";
import type {
  DossierMedia,
  DossierUnitVariant,
  MediaType,
  PropertyDossier,
} from "@/lib/properties/types";
import { FactValue } from "./fact-value";
import { GridRow, PageContainer, PageFrame, PageSection } from "./page-frame";
import { BodyText, DisplayHeading, Eyebrow, TabularValue } from "./typography";
import { VerifiedBadge, reraVerifiedFact } from "./verified-badge";

/**
 * The property dossier.
 *
 * `design.v1.md` asks this screen to organise facts progressively rather than
 * dump a database row: identity first, then the facts a buyer needs to decide
 * whether to keep reading, then comparable depth. So the order is deliberate —
 * what and where it is, when it is ready, what you would actually live in,
 * what it offers, how it is built, what is independently registered, and only
 * then the supporting detail.
 *
 * Like every buyer surface, it is a pure function of its data and carries no
 * price: `PropertyDossier` has no price field, so there is none to render.
 *
 * Two absences worth naming, both deliberate. **Coordinates are not shown.**
 * `latitude`/`longitude` are modelled to support map and locality search later
 * (DECISIONS.md, 2026-08-31); printing them as text would be the raw database
 * dump this screen exists to avoid. **Media files are not served.** The
 * media-delivery gate is deferred past Phase 2B (DECISIONS.md, 2026-09-07), so
 * the dossier lists what media the catalog holds without fetching any of it.
 */

const MEDIA_TYPE_LABEL: Record<MediaType, string> = {
  photo: "Photo",
  floor_plan: "Floor plan",
  video: "Video",
  brochure_pdf: "Brochure (PDF)",
};

/** A labelled fact in a definition list. The dossier's smallest unit. */
function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt>
        <Eyebrow>{label}</Eyebrow>
      </dt>
      <dd className="text-foreground text-sm">{children}</dd>
    </div>
  );
}

function Section({
  title,
  children,
  ...props
}: {
  title: string;
  children: React.ReactNode;
} & React.ComponentProps<"section">) {
  return (
    <section className="flex flex-col gap-4" {...props}>
      <DisplayHeading level={2} className="text-3xl">
        {title}
      </DisplayHeading>
      {children}
    </section>
  );
}

function UnitVariant({ variant }: { variant: DossierUnitVariant }) {
  const areas = areasByBasis(variant.areas);
  const rooms = readRoomDimensions(variant.dimensions);

  return (
    <article
      data-slot="unit-variant"
      className="border-border bg-card flex flex-col gap-5 rounded-lg border p-6"
    >
      <div className="flex flex-col gap-1">
        <DisplayHeading level={3}>{variant.variantName}</DisplayHeading>
        <p className="text-muted-foreground text-sm">
          <FactValue value={variant.bhkType?.label ?? null} />
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Fact label="Layout">
          <FactValue value={variant.layoutType?.label ?? null} />
        </Fact>
        <Fact label="Units of this type">
          <FactValue value={variant.totalUnitsOfVariant} tabular />
        </Fact>
      </dl>

      {/*
       * Every basis is listed, including the ones this variant did not publish.
       * An area basis is never derived from another — carpet area is not a
       * fixed ratio of super built-up area — so an unpublished basis says so.
       */}
      <dl
        data-slot="variant-areas"
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        {AREA_BASIS_ORDER.map((basis) => {
          const area = formatSqft(areas[basis]);
          return (
            <Fact key={basis} label={AREA_BASIS_LABEL[basis]}>
              <FactValue
                value={area === null ? null : `${area} sq ft`}
                tabular
              />
            </Fact>
          );
        })}
      </dl>

      {rooms === null ? null : (
        <div data-slot="variant-dimensions" className="flex flex-col gap-2">
          <Eyebrow>Room dimensions</Eyebrow>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {rooms.map((room) => (
              <div
                key={room.name}
                className="border-border flex items-baseline justify-between gap-4 border-b pb-1"
              >
                <dt className="text-muted-foreground text-sm">{room.name}</dt>
                <dd className="text-foreground text-sm">
                  <TabularValue>{formatRoomDimension(room)}</TabularValue>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </article>
  );
}

/**
 * What media the catalog holds, listed rather than displayed.
 *
 * Media delivery is deferred past this phase, so no file is fetched — but the
 * *inventory* is a published fact and withholding it would be its own small
 * dishonesty. The distinction this section keeps is between "this property has
 * no media" and "this property has media you cannot see here yet"; collapsing
 * the two into one empty state would state something false about the property.
 */
function MediaSection({ media }: { media: readonly DossierMedia[] }) {
  if (media.length === 0) {
    return (
      <Section title="Photos and plans" data-slot="dossier-media">
        <BodyText className="text-muted-foreground" data-slot="media-empty">
          No photos, floor plans, or other media have been published for this
          property.
        </BodyText>
      </Section>
    );
  }

  return (
    <Section title="Photos and plans" data-slot="dossier-media">
      <BodyText className="text-muted-foreground">
        These are published for this property. Viewing them here is not
        available yet.
      </BodyText>
      <ul className="flex flex-col gap-2">
        {media.map((item) => (
          <li
            key={item.id}
            data-slot="media-item"
            className="border-border flex flex-wrap items-baseline gap-x-3 border-b pb-2 text-sm"
          >
            <span className="text-foreground font-medium">
              {MEDIA_TYPE_LABEL[item.mediaType]}
            </span>
            <FactValue value={item.caption} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function CatalogSection({
  title,
  slot,
  items,
  emptyMessage,
}: {
  title: string;
  slot: string;
  items: readonly {
    key: string;
    label: string;
    category: string;
    status: "available" | "not_stated" | "explicitly_not_offered";
    valueText?: string | null;
  }[];
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return (
      <Section title={title} data-slot={slot}>
        <BodyText className="text-muted-foreground">{emptyMessage}</BodyText>
      </Section>
    );
  }

  /*
   * Every row stays on the page — a buyer cannot tell an amenity nobody
   * recorded from one the developer said it does not offer unless both are
   * there. But the catalog has 26 amenities and a typical submission states a
   * handful, so listing them flat produces a wall of "Not stated" that buries
   * the few real answers. That is the table dump `design.v1.md` rules out.
   *
   * So: stated facts lead, and the unrecorded ones sit behind a disclosure
   * that names its own count. Nothing is hidden — the summary states how many
   * there are, every one is in the markup, and `<details>` opens without
   * JavaScript. This is progressive disclosure, not concealment.
   */
  const stated = items.filter((item) => item.status !== "not_stated");
  const unrecorded = items.filter((item) => item.status === "not_stated");

  return (
    <Section title={title} data-slot={slot}>
      {/*
       * No "nothing was recorded" message when every row is unrecorded: the
       * disclosure below already says so, with a count, and saying it twice
       * reads as two different facts.
       */}
      {groupByCategory(stated).map((group) => (
        <div key={group.category} className="flex flex-col gap-2">
          <Eyebrow>{humaniseCategory(group.category)}</Eyebrow>
          <CatalogList items={group.items} />
        </div>
      ))}

      {unrecorded.length === 0 ? null : (
        <details data-slot="unrecorded-details" className="mt-2">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm">
            {unrecorded.length} not recorded for this property
          </summary>
          <div className="mt-4 flex flex-col gap-4">
            {groupByCategory(unrecorded).map((group) => (
              <div key={group.category} className="flex flex-col gap-2">
                <Eyebrow>{humaniseCategory(group.category)}</Eyebrow>
                <CatalogList items={group.items} />
              </div>
            ))}
          </div>
        </details>
      )}
    </Section>
  );
}

function CatalogList({
  items,
}: {
  items: readonly {
    key: string;
    label: string;
    status: "available" | "not_stated" | "explicitly_not_offered";
    valueText?: string | null;
  }[];
}) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
      {items.map((item) => (
        <div
          key={item.key}
          data-slot="catalog-item"
          data-status={item.status}
          className="border-border flex flex-wrap items-baseline justify-between gap-x-4 border-b pb-1"
        >
          <dt className="text-muted-foreground text-sm">{item.label}</dt>
          <dd className="text-sm">
            <FactValue
              status={item.status}
              value={item.valueText ?? undefined}
            />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export interface DossierScreenProps {
  dossier: PropertyDossier;
}

export function DossierScreen({ dossier }: DossierScreenProps) {
  const { location, possession, rera, developer } = dossier;
  const verifiedFact = reraVerifiedFact(rera);
  const possessionDate = formatPossessionDate(possession.possessionDate);
  const launchDate = formatPossessionDate(possession.launchDate);
  const carpetRange = formatAreaRange(
    rera.carpetAreaRangeMinSqft,
    rera.carpetAreaRangeMaxSqft,
  );

  return (
    <PageFrame>
      {/*
       * Structured data describing a residence, never an offer — an offer's
       * purpose is to carry a price. Built by `dossierJsonLd`, which is tested
       * for price absence alongside the rendered page.
       */}
      <script
        type="application/ld+json"
        data-slot="dossier-json-ld"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(dossierJsonLd(dossier)),
        }}
      />

      <PageContainer>
        <PageSection className="flex flex-col gap-12">
          <div className="flex flex-col gap-4">
            <Link
              href={BROWSE_PATH}
              className="text-muted-foreground hover:text-foreground w-fit text-sm underline underline-offset-4"
            >
              Back to all properties
            </Link>

            <div className="flex flex-col gap-2">
              <Eyebrow>{dossier.propertyType.label}</Eyebrow>
              <DisplayHeading level={1}>{dossier.name}</DisplayHeading>
              <p className="text-muted-foreground text-base">
                {developer.name} · {location.locality}, {location.city}
              </p>
            </div>

            {/* Renders nothing without a registration number to assert. */}
            <VerifiedBadge fact={verifiedFact} />

            {dossier.description === null ? null : (
              <BodyText>{dossier.description}</BodyText>
            )}
          </div>

          <GridRow>
            <dl
              data-slot="key-facts"
              className="border-border bg-card grid grid-cols-2 gap-6 rounded-lg border p-6 sm:grid-cols-3 md:col-span-12 lg:grid-cols-5"
            >
              <Fact label="Possession">
                <FactValue
                  value={
                    possession.status === null
                      ? null
                      : POSSESSION_STATUS_LABEL[possession.status]
                  }
                />
              </Fact>
              <Fact label="Possession date">
                <FactValue value={possessionDate} tabular />
              </Fact>
              <Fact label="Launched">
                <FactValue value={launchDate} tabular />
              </Fact>
              <Fact label="Towers">
                <FactValue value={dossier.totalTowers} tabular />
              </Fact>
              <Fact label="Units">
                <FactValue value={dossier.totalUnits} tabular />
              </Fact>
            </dl>
          </GridRow>

          <Section title="Configurations" data-slot="dossier-variants">
            {dossier.unitVariants.length === 0 ? (
              <BodyText className="text-muted-foreground">
                No unit configurations have been published for this property.
              </BodyText>
            ) : (
              <div className="flex flex-col gap-4">
                {dossier.unitVariants.map((variant) => (
                  <UnitVariant key={variant.id} variant={variant} />
                ))}
              </div>
            )}
          </Section>

          <CatalogSection
            title="Amenities"
            slot="dossier-amenities"
            items={dossier.amenities}
            emptyMessage="No amenities have been recorded for this property."
          />

          <CatalogSection
            title="Specifications"
            slot="dossier-specifications"
            items={dossier.specifications}
            emptyMessage="No specifications have been recorded for this property."
          />

          <MediaSection media={dossier.media} />

          <Section title="RERA" data-slot="dossier-rera">
            <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {/*
               * `registered: false` renders as "Not stated", not as "Not
               * registered". The column defaults to false and no code path sets
               * it — the field contract records that OCR never sets RERA
               * verification — so false means "no registration has been
               * recorded here", which is not the same claim as "this project is
               * not registered". Asserting the latter about a real project
               * would be a fabricated fact of the worst kind.
               */}
              <Fact label="Registration">
                <FactValue value={rera.registered ? "Registered" : null} />
              </Fact>
              <Fact label="Registration number">
                <FactValue value={rera.registrationNumber} tabular />
              </Fact>
              <Fact label="Last verified">
                <FactValue
                  value={
                    rera.lastVerifiedAt === null
                      ? null
                      : rera.lastVerifiedAt.slice(0, 10)
                  }
                  tabular
                />
              </Fact>
              <Fact label="Project land area">
                <FactValue
                  value={
                    formatSqft(rera.projectLandAreaSqft) === null
                      ? null
                      : `${formatSqft(rera.projectLandAreaSqft)} sq ft`
                  }
                  tabular
                />
              </Fact>
              <Fact label="Carpet area range">
                <FactValue value={carpetRange} tabular />
              </Fact>
              <Fact label="Construction progress">
                <FactValue
                  value={formatPercent(rera.constructionProgressPercent)}
                  tabular
                />
              </Fact>
            </dl>
          </Section>

          <Section title="Location" data-slot="dossier-location">
            <dl className="grid grid-cols-2 gap-6 sm:grid-cols-3">
              <Fact label="Locality">
                <FactValue value={location.locality} />
              </Fact>
              <Fact label="City">
                <FactValue value={location.city} />
              </Fact>
              <Fact label="Pincode">
                <FactValue value={location.pincode} tabular />
              </Fact>
            </dl>
          </Section>

          <Section title="Developer" data-slot="dossier-developer">
            <dl className="flex flex-col gap-4">
              <Fact label="Name">
                <FactValue value={developer.name} />
              </Fact>
              <Fact label="About">
                <FactValue value={developer.description} />
              </Fact>
              <Fact label="Website">
                {developer.website === null ? (
                  <FactValue value={null} />
                ) : (
                  <a
                    href={developer.website}
                    rel="noopener noreferrer nofollow"
                    target="_blank"
                    className="underline underline-offset-4"
                  >
                    {developer.website}
                  </a>
                )}
              </Fact>
            </dl>
          </Section>

          <div>
            <Link
              href={BROWSE_PATH}
              className="border-border text-foreground hover:border-[var(--color-terracotta)] inline-flex items-center rounded-lg border px-4 py-2 text-sm transition-colors"
            >
              Back to all properties
            </Link>
          </div>
        </PageSection>
      </PageContainer>
    </PageFrame>
  );
}
