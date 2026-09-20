import Link from "next/link";
import {
  MediaGallery,
  type GalleryItem,
  type GallerySection,
} from "./media-gallery";
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
  shortUnitTypeName,
} from "@/lib/properties/dossier";
import type { ReraSourcedFact } from "@/lib/properties/rera-source";
import type {
  DossierMedia,
  DossierRera,
  DossierUnitVariant,
  MediaType,
  PropertyDossier,
} from "@/lib/properties/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
 * dump this screen exists to avoid. **Media is served through the media
 * route** (`/api/v1/media/{id}`), never by storage path.
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

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "20 Sep 2026" in Indian time, spelled out here so it never varies with the
 * runtime's locale data. */
const shortDate = (iso: string): string => {
  const [year, month, day] = new Date(iso)
    .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
    .split("-")
    .map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
};

const GUJRERA_URL = "https://gujrera.gujarat.gov.in/";

/**
 * A quiet "Source: GujRERA, checked 20 September 2026" under a fact, only when the
 * regulator's record at its last check stated exactly this value (see
 * `reraSourcedFacts`). It is never put on a derived or brochure-sourced value.
 */
function ReraSource({
  rera,
  fact,
}: {
  rera: DossierRera;
  fact: ReraSourcedFact;
}) {
  if (rera.lastCheckedAt === null || !rera.sourcedFacts.includes(fact)) {
    return null;
  }
  const checked = shortDate(rera.lastCheckedAt);
  return (
    <span
      data-slot="rera-source"
      data-fact={fact}
      className="text-muted-foreground mt-1 block text-xs"
    >
      Source:{" "}
      <a
        href={GUJRERA_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2"
      >
        GujRERA
      </a>
      , checked {checked}
    </span>
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

/**
 * The unit types as one card, with browser-style tabs along its top. Only the open
 * type is on the page. A tab carries a short name (`shortUnitTypeName`), the full
 * name is on hover and in the open type's heading. Tabs share the width and shrink
 * together, so six types fit without a scroll bar; a narrow phone scrolls the strip
 * sideways with the bar hidden. A single type needs no tabs.
 */
function Configurations({ variants }: { variants: DossierUnitVariant[] }) {
  return (
    <div
      data-slot="variants-card"
      className="border-border bg-card overflow-hidden rounded-lg border"
    >
      {variants.length === 1 ? (
        <div className="p-6">
          <UnitVariant variant={variants[0]} />
        </div>
      ) : (
        <Tabs defaultValue={variants[0].id}>
          <TabsList
            aria-label="Unit types"
            className="bg-muted gap-1 overflow-x-auto border-b-0 px-2 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {variants.map((variant) => (
              <TabsTrigger
                key={variant.id}
                value={variant.id}
                title={variant.variantName}
                className="border-border hover:bg-card/60 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:border-primary min-w-28 flex-1 basis-0 justify-center rounded-t-lg border border-b-0 border-transparent px-4 py-2.5 data-[state=active]:border-t-2 data-[state=active]:border-x-transparent"
              >
                <span className="truncate">
                  {shortUnitTypeName(variant.variantName)}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          {variants.map((variant) => (
            <TabsContent
              key={variant.id}
              value={variant.id}
              className="mt-0 p-6"
            >
              <UnitVariant variant={variant} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}

function UnitVariant({ variant }: { variant: DossierUnitVariant }) {
  const areas = areasByBasis(variant.areas);
  const rooms = readRoomDimensions(variant.dimensions);

  return (
    <article data-slot="unit-variant" className="flex flex-col gap-5">
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
            {rooms.map((room, index) => (
              <div
                // A floor plan can list the same room name more than once
                // (two bedrooms, several ducts), so the name alone is not a key.
                key={`${room.name}:${index}`}
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
 * The property's published pictures and documents.
 *
 * Photos and floor plans are separate expandable sections of small cards (floor
 * plans grouped by unit type); choosing one opens a pop-up carousel (see
 * `MediaGallery`). Each picture is fetched from `/api/v1/media/{id}` (a fresh
 * short-lived link per request; the storage path never reaches the page) and
 * carries its credit, because images taken from a developer's brochure are
 * published with attribution (DECISIONS.md, 2026-09-19). Other files, such as a
 * public brochure PDF, are offered as a download. A property with no media says
 * so plainly.
 */
function MediaSection({
  media,
  unitVariants,
}: {
  media: readonly DossierMedia[];
  unitVariants: PropertyDossier["unitVariants"];
}) {
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

  const asItem = (item: DossierMedia, label: string): GalleryItem => ({
    id: item.id,
    label,
    caption: item.caption,
    attribution: item.attribution,
  });

  const photos = media.filter((item) => item.mediaType === "photo");
  const plans = media.filter((item) => item.mediaType === "floor_plan");
  const documents = media.filter(
    (item) => item.mediaType !== "photo" && item.mediaType !== "floor_plan",
  );

  // Floor plans under the unit type they belong to, in the order the unit types
  // are listed; a plan tied to no unit type goes last.
  const planGroups = [
    ...unitVariants.map((variant) => ({
      heading: variant.variantName as string | null,
      items: plans
        .filter((item) => item.unitVariantId === variant.id)
        .map((item) => asItem(item, variant.variantName)),
    })),
    {
      heading: "Other plans" as string | null,
      items: plans
        .filter(
          (item) =>
            item.unitVariantId === null ||
            !unitVariants.some((variant) => variant.id === item.unitVariantId),
        )
        .map((item) => asItem(item, "Floor plan")),
    },
  ].filter((group) => group.items.length > 0);
  // A single group needs no heading of its own.
  const onlyGroup = planGroups.length === 1 ? planGroups[0] : null;

  const sections: GallerySection[] = [
    ...(photos.length > 0
      ? [
          {
            key: "photos",
            title: "Photos",
            open: true,
            fit: "cover" as const,
            groups: [
              {
                heading: null,
                items: photos.map((item) => asItem(item, "Photo")),
              },
            ],
          },
        ]
      : []),
    ...(plans.length > 0
      ? [
          {
            key: "floor-plans",
            title: "Floor plans",
            open: false,
            fit: "contain" as const,
            groups: onlyGroup
              ? [{ heading: null, items: onlyGroup.items }]
              : planGroups,
          },
        ]
      : []),
  ];

  return (
    <Section title="Photos and plans" data-slot="dossier-media">
      {sections.length > 0 ? <MediaGallery sections={sections} /> : null}
      {documents.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {documents.map((item) => (
            <li
              key={item.id}
              data-slot="media-item"
              className="border-border flex flex-wrap items-baseline gap-x-3 border-b pb-2 text-sm"
            >
              <a
                href={`/api/v1/media/${item.id}`}
                className="text-foreground font-medium underline underline-offset-4"
              >
                {MEDIA_TYPE_LABEL[item.mediaType]}
              </a>
              <FactValue value={item.caption} />
            </li>
          ))}
        </ul>
      ) : null}
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
                <ReraSource rera={rera} fact="possession_date" />
              </Fact>
              <Fact label="Launched">
                <FactValue value={launchDate} tabular />
              </Fact>
              <Fact label="Towers">
                <FactValue value={dossier.totalTowers} tabular />
              </Fact>
              <Fact label="Units">
                <FactValue value={dossier.totalUnits} tabular />
                <ReraSource rera={rera} fact="total_units" />
              </Fact>
            </dl>
          </GridRow>

          <Section title="Configurations" data-slot="dossier-variants">
            {dossier.unitVariants.length === 0 ? (
              <BodyText className="text-muted-foreground">
                No unit configurations have been published for this property.
              </BodyText>
            ) : (
              <Configurations variants={dossier.unitVariants} />
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

          <MediaSection
            media={dossier.media}
            unitVariants={dossier.unitVariants}
          />

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
                <ReraSource rera={rera} fact="registration_number" />
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
                <ReraSource rera={rera} fact="construction_progress" />
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
