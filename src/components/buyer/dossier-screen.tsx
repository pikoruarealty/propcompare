import Link from "next/link";
import { identityPicture } from "@/lib/properties/identity-picture";
import { mapEmbedUrl } from "@/lib/properties/map-url";
import { densityText } from "@/lib/properties/density";
import { reraFactLines } from "@/lib/properties/rera-facts";
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
  dossierFactCount,
  formatSqft,
  LONG_VALUE_LENGTH,
  groupByCategory,
  humaniseCategory,
  readRoomDimensions,
  shortUnitTypeName,
  splitAmenitiesFullList,
  splitListValue,
} from "@/lib/properties/dossier";
import type { ReraSourcedFact } from "@/lib/properties/rera-source";
import type {
  DossierMedia,
  DossierLock,
  DossierRera,
  DossierUnitVariant,
  MediaType,
  PropertyDossier,
} from "@/lib/properties/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompareToggle } from "./compare-toggle";
import { developerHref } from "./developer-screen";
import { EnquiryForm } from "./enquiry-form";
import {
  LockedAmenities,
  LockedConfigurations,
  LockedMedia,
  UNLOCK_ID,
  UnlockPrompt,
} from "./locked-sections";
import { ReportProblemLink } from "./report-problem-link";
import { SavePropertyButton } from "./save-property-button";
import { FactValue } from "./fact-value";
import { PageContainer, PageFrame, PageSection } from "./page-frame";
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
  large,
}: {
  label: string;
  children: React.ReactNode;
  /** Set as a headline figure (the key-facts band) rather than running detail. */
  large?: boolean;
}) {
  return (
    <div
      className={
        large
          ? "flex flex-col gap-2 lg:px-6 lg:first:pl-0"
          : "flex flex-col gap-1"
      }
    >
      <dt>
        <Eyebrow>{label}</Eyebrow>
      </dt>
      <dd
        className={
          large
            ? "text-foreground text-xl [overflow-wrap:anywhere]"
            : "text-foreground text-sm [overflow-wrap:anywhere]"
        }
      >
        {children}
      </dd>
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
    <section
      className="border-border flex scroll-mt-24 flex-col gap-4 border-t pt-8"
      {...props}
    >
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
  lock,
}: {
  media: readonly DossierMedia[];
  unitVariants: PropertyDossier["unitVariants"];
  /** Set for a signed-out visitor: what was withheld beyond the preview. */
  lock?: DossierLock;
}) {
  const withheld =
    lock !== undefined && lock.hiddenPhotos + lock.hiddenFloorPlans > 0;
  if (media.length === 0 && !withheld) {
    return (
      <Section
        title="Photos and plans"
        id="photos-and-plans"
        data-slot="dossier-media"
      >
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
            open: true,
            fit: "contain" as const,
            groups: onlyGroup
              ? [{ heading: null, items: onlyGroup.items }]
              : planGroups,
          },
        ]
      : []),
  ];

  return (
    <Section
      title="Photos and plans"
      id="photos-and-plans"
      data-slot="dossier-media"
    >
      {sections.length > 0 ? <MediaGallery sections={sections} /> : null}
      {lock ? <LockedMedia lock={lock} /> : null}
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
  id,
  slot,
  items,
  emptyMessage,
  trailing,
}: {
  title: string;
  id: string;
  slot: string;
  items: readonly {
    key: string;
    label: string;
    category: string;
    status: "available" | "not_stated" | "explicitly_not_offered";
    valueText?: string | null;
  }[];
  emptyMessage: string;
  /** Rendered inside the section, after the catalog rows. */
  trailing?: React.ReactNode;
}) {
  if (items.length === 0) {
    return (
      <Section title={title} id={id} data-slot={slot}>
        <BodyText className="text-muted-foreground">{emptyMessage}</BodyText>
        {trailing}
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
    <Section title={title} id={id} data-slot={slot}>
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

      {trailing}
    </Section>
  );
}

type CatalogRowItem = {
  key: string;
  label: string;
  status: "available" | "not_stated" | "explicitly_not_offered";
  valueText?: string | null;
};

/** A stated value that is a run of items ("A; B; C") or a long sentence has no
 * room beside its label; it is set full width beneath it. */
const isWide = (item: CatalogRowItem): boolean =>
  item.status === "available" &&
  (splitListValue(item.valueText) !== null ||
    (item.valueText?.length ?? 0) > LONG_VALUE_LENGTH);

/**
 * A printed list as a list: one item to a line in two columns, each on its own
 * hairline, instead of one run of text separated by semicolons.
 */
function ItemList({ items }: { items: readonly string[] }) {
  return (
    <ul
      data-slot="item-list"
      className="grid grid-cols-1 gap-x-8 sm:grid-cols-2"
    >
      {items.map((item, index) => (
        <li
          key={`${item}:${index}`}
          className="border-border text-foreground flex gap-3 border-b py-2 text-sm leading-6"
        >
          <span
            aria-hidden="true"
            className="bg-muted-foreground mt-3 h-px w-3 shrink-0"
          />
          <span className="min-w-0 [overflow-wrap:anywhere]">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function CatalogList({ items }: { items: readonly CatalogRowItem[] }) {
  const narrow = items.filter((item) => !isWide(item));
  const wide = items.filter(isWide);
  return (
    <div className="flex flex-col gap-4">
      {narrow.length === 0 ? null : (
        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
          {narrow.map((item) => (
            <div
              key={item.key}
              data-slot="catalog-item"
              data-status={item.status}
              className="border-border flex flex-wrap items-baseline justify-between gap-x-4 border-b pb-1"
            >
              <dt className="text-muted-foreground text-sm">{item.label}</dt>
              <dd className="text-sm [overflow-wrap:anywhere]">
                <FactValue
                  status={item.status}
                  value={item.valueText ?? undefined}
                />
              </dd>
            </div>
          ))}
        </dl>
      )}
      {wide.map((item) => {
        const list = splitListValue(item.valueText);
        return (
          <div
            key={item.key}
            data-slot="catalog-item"
            data-status={item.status}
            className="flex flex-col gap-1"
          >
            <p className="text-muted-foreground text-sm">{item.label}</p>
            {list ? (
              <ItemList items={list} />
            ) : (
              <p className="border-border text-foreground border-b pb-2 text-sm leading-6 [overflow-wrap:anywhere]">
                {item.valueText}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export interface DossierScreenProps {
  dossier: PropertyDossier;
}

/** The sections a reader can jump to, in page order. */
const SECTION_LINKS = [
  { href: "#photos-and-plans", label: "Photos and plans" },
  { href: "#configurations", label: "Configurations" },
  { href: "#amenities", label: "Amenities" },
  { href: "#specifications", label: "Specifications" },
  { href: "#rera", label: "RERA" },
  { href: "#location", label: "Location" },
  { href: "#developer", label: "Developer" },
  { href: "#enquiry", label: "Ask about this property" },
] as const;

export function DossierScreen({ dossier }: DossierScreenProps) {
  const { location, possession, rera, developer } = dossier;
  const embedUrl = mapEmbedUrl(location.mapUrl);
  const nearbyLists = [
    { label: "Connectivity", items: location.nearby.connectivity },
    { label: "Hospitals", items: location.nearby.hospitals },
    { label: "Schools and institutions", items: location.nearby.schools },
  ];
  const verifiedFact = reraVerifiedFact({
    registered: rera.registered,
    registrationNumber: rera.registrationNumber,
    // The date of the latest successful check of the regulator's record.
    lastVerifiedAt: rera.lastCheckedAt,
  });
  const possessionDate = formatPossessionDate(possession.possessionDate);
  const launchDate = formatPossessionDate(possession.launchDate);
  const carpetRange = formatAreaRange(
    rera.carpetAreaRangeMinSqft,
    rera.carpetAreaRangeMaxSqft,
  );
  const heroPhoto =
    dossier.media.find((m) => m.mediaType === "photo" && m.isPrimary) ??
    dossier.media.find((m) => m.mediaType === "photo") ??
    null;
  const lock = dossier.lock;
  const counts = lock ? null : dossierFactCount(dossier);
  const confirmedByRera =
    rera.lastCheckedAt === null ? 0 : rera.sourcedFacts.length;
  const overImage = heroPhoto !== null;
  const { amenitiesFullList, specifications } = splitAmenitiesFullList(
    dossier.specifications,
  );

  const amenitiesFullListBlock =
    amenitiesFullList === null ? null : (
      <div className="flex flex-col gap-2 pt-2" data-slot="amenities-full-list">
        <Eyebrow>{amenitiesFullList.label}</Eyebrow>
        <BodyText className="text-muted-foreground text-sm">
          As printed by the developer, broader than the catalog above and not
          used to compare properties.
        </BodyText>
        {splitListValue(amenitiesFullList.valueText) ? (
          <ItemList items={splitListValue(amenitiesFullList.valueText) ?? []} />
        ) : (
          <BodyText className="text-sm">
            <FactValue
              status={amenitiesFullList.status}
              value={amenitiesFullList.valueText}
            />
          </BodyText>
        )}
      </div>
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
        <div className="pt-6 pb-4">
          <Link
            href={BROWSE_PATH}
            className="text-muted-foreground hover:text-foreground w-fit text-sm underline underline-offset-4"
          >
            Back to all properties
          </Link>
        </div>

        {/*
         * The opening plate: the primary photograph, large, with the name over it.
         * A property with no photograph opens on a tonal band with the same text
         * in ink. Nothing here states more than the facts below it.
         */}
        <header
          data-slot="dossier-hero"
          className={
            overImage
              ? "relative flex min-h-[26rem] items-end overflow-hidden rounded-lg md:min-h-[32rem]"
              : "bg-tone-sage border-border rounded-lg border"
          }
        >
          {heroPhoto ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- served through the media route, never by storage path */}
              <img
                src={`/api/v1/media/${heroPhoto.id}`}
                alt={`${dossier.name}, ${location.locality}`}
                fetchPriority="high"
                className="absolute inset-0 size-full object-cover"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/5"
              />
            </>
          ) : null}
          <div
            className={
              overImage
                ? "relative flex w-full flex-col gap-4 p-6 text-white md:p-10"
                : "flex w-full flex-col gap-4 p-6 md:p-10"
            }
          >
            <div className="flex flex-col gap-2">
              <Eyebrow className={overImage ? "text-white/80" : undefined}>
                {dossier.propertyType.label}
              </Eyebrow>
              <DisplayHeading
                level={1}
                size="hero"
                className={
                  overImage
                    ? "text-5xl text-white md:text-7xl"
                    : "text-5xl md:text-7xl"
                }
              >
                {dossier.name}
              </DisplayHeading>
              <p
                className={
                  overImage
                    ? "text-base text-white/85"
                    : "text-muted-foreground text-base"
                }
              >
                <Link
                  href={developerHref(developer.id)}
                  className="underline underline-offset-4"
                >
                  {developer.name}
                </Link>{" "}
                · {location.locality}, {location.city}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {/* Renders nothing without a registration number to assert. */}
              <VerifiedBadge fact={verifiedFact} />
              <CompareToggle
                slug={dossier.slug}
                name={dossier.name}
                mediaId={
                  heroPhoto?.id ?? identityPicture(dossier.media)?.id ?? null
                }
              />
              <SavePropertyButton propertyId={dossier.id} slug={dossier.slug} />
            </div>
          </div>
        </header>
        {heroPhoto?.attribution ? (
          <p
            data-slot="hero-credit"
            className="text-muted-foreground pt-2 text-xs tracking-[0.08em] uppercase"
          >
            Photograph credit: {heroPhoto.attribution}
          </p>
        ) : null}

        {dossier.description === null ? null : (
          <BodyText className="pt-8 text-lg leading-8">
            {dossier.description}
          </BodyText>
        )}

        <dl
          data-slot="key-facts"
          className="border-border mt-10 grid grid-cols-2 gap-x-6 gap-y-8 border-y py-8 sm:grid-cols-3 lg:grid-cols-5 lg:gap-x-0 lg:divide-x"
        >
          <Fact label="Possession" large>
            <FactValue
              value={
                possession.status === null
                  ? null
                  : POSSESSION_STATUS_LABEL[possession.status]
              }
            />
          </Fact>
          <Fact label="Possession date" large>
            <FactValue value={possessionDate} tabular />
            <ReraSource rera={rera} fact="possession_date" />
          </Fact>
          <Fact label="Launched" large>
            <FactValue value={launchDate} tabular />
          </Fact>
          <Fact label="Towers" large>
            <FactValue value={dossier.totalTowers} tabular />
          </Fact>
          <Fact label="Units" large>
            <FactValue value={dossier.totalUnits} tabular />
            <ReraSource rera={rera} fact="total_units" />
          </Fact>
        </dl>

        <PageSection className="grid grid-cols-1 gap-12 lg:grid-cols-12">
          <div className="flex min-w-0 flex-col gap-14 lg:col-span-8">
            {lock ? <UnlockPrompt slug={dossier.slug} lock={lock} /> : null}

            <MediaSection
              media={dossier.media}
              unitVariants={dossier.unitVariants}
              lock={lock}
            />

            <Section
              title="Configurations"
              id="configurations"
              data-slot="dossier-variants"
            >
              {dossier.unitVariants.length === 0 ? (
                <BodyText className="text-muted-foreground">
                  No unit configurations have been published for this property.
                </BodyText>
              ) : lock ? (
                <LockedConfigurations variants={dossier.unitVariants} />
              ) : (
                <Configurations variants={dossier.unitVariants} />
              )}
            </Section>

            {lock ? (
              <Section
                title="Amenities"
                id="amenities"
                data-slot="dossier-amenities"
              >
                <LockedAmenities catalog={lock.amenityCatalog} />
                {amenitiesFullListBlock}
              </Section>
            ) : (
              <CatalogSection
                title="Amenities"
                id="amenities"
                slot="dossier-amenities"
                items={dossier.amenities}
                emptyMessage="No amenities have been recorded for this property."
                trailing={amenitiesFullListBlock}
              />
            )}

            <CatalogSection
              title="Specifications"
              id="specifications"
              slot="dossier-specifications"
              items={specifications}
              emptyMessage="No specifications have been recorded for this property."
            />

            <Section title="RERA" id="rera" data-slot="dossier-rera">
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
                {/* The date of the latest successful check of the regulator's
                 * record. */}
                <Fact label="Last checked with RERA">
                  <FactValue
                    value={
                      rera.lastCheckedAt === null
                        ? null
                        : shortDate(rera.lastCheckedAt)
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
                {/* Calculated from the land area and the unit count; it replaced the
                 * density specification (schema v18), so it is stated here. */}
                <Fact label="Density">
                  <FactValue value={densityText(dossier)} tabular />
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
                {/* Everything else the regulator states, each with the quarter or
                 * date it is as on (schema v17). A figure it does not state has no
                 * line. */}
                {rera.facts
                  ? reraFactLines(rera.facts).map((line) => (
                      <Fact key={line.label} label={line.label}>
                        <FactValue value={line.value} tabular />
                      </Fact>
                    ))
                  : null}
              </dl>
            </Section>

            <Section
              title="Location"
              id="location"
              data-slot="dossier-location"
            >
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
                {location.nearby.plotNumber ? (
                  <Fact label="Plot number">
                    <FactValue value={location.nearby.plotNumber} tabular />
                  </Fact>
                ) : null}
              </dl>

              {location.mapUrl ? (
                <div
                  data-slot="dossier-map"
                  className="mt-8 flex flex-col gap-3"
                >
                  {embedUrl ? (
                    <iframe
                      src={embedUrl}
                      title={`Map of ${dossier.name}`}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      className="border-border aspect-[16/9] w-full rounded-lg border"
                    />
                  ) : null}
                  <a
                    href={location.mapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary w-fit text-sm underline underline-offset-4"
                  >
                    Open in Google Maps
                  </a>
                </div>
              ) : null}

              <div
                data-slot="dossier-nearby"
                className="mt-8 grid gap-8 sm:grid-cols-3"
              >
                {nearbyLists.map((list) =>
                  list.items.length > 0 ? (
                    <div key={list.label} className="flex flex-col gap-2">
                      <h3 className="font-display text-lg">{list.label}</h3>
                      <ul className="flex flex-col gap-1.5 text-sm">
                        {list.items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null,
                )}
              </div>
              {nearbyLists.every((list) => list.items.length === 0) ? (
                <p
                  data-slot="dossier-nearby-empty"
                  className="text-muted-foreground mt-8 text-sm"
                >
                  Nearby connectivity, hospitals and schools are not stated.
                </p>
              ) : null}
            </Section>

            <Section
              title="Developer"
              id="developer"
              data-slot="dossier-developer"
            >
              <dl className="flex flex-col gap-4">
                <Fact label="Name">
                  <Link
                    href={developerHref(developer.id)}
                    className="underline underline-offset-4"
                  >
                    {developer.name}
                  </Link>{" "}
                  <span className="text-muted-foreground">
                    (all their published projects)
                  </span>
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

            <Section
              title="Ask about this property"
              id="enquiry"
              data-slot="dossier-enquiry"
            >
              <EnquiryForm
                propertyId={dossier.id}
                slug={dossier.slug}
                propertyName={dossier.name}
                unitTypes={dossier.unitVariants.map((variant) => ({
                  id: variant.id,
                  name: variant.variantName,
                }))}
              />
            </Section>
          </div>

          {/*
           * The side stack: short enough to stay in view while the page scrolls.
           * How much of the record is stated (a count, never a score), and a
           * jump list for a long page.
           */}
          <aside
            aria-label="About this record"
            className="lg:sticky lg:top-24 lg:col-span-4 lg:self-start"
          >
            <div className="bg-tone-sage border-border flex flex-col gap-6 rounded-lg border p-6">
              {counts === null ? (
                <div
                  data-slot="dossier-locked-note"
                  className="flex flex-col gap-3"
                >
                  <Eyebrow>Full record</Eyebrow>
                  <p className="text-muted-foreground text-sm leading-6">
                    The unit types, amenities, floor plans and remaining photos
                    open when you sign in.
                  </p>
                  <a
                    href={`#${UNLOCK_ID}`}
                    className="text-primary w-fit text-sm underline underline-offset-4"
                  >
                    Sign in with your phone number
                  </a>
                </div>
              ) : (
                <div
                  data-slot="dossier-completeness"
                  className="flex flex-col gap-3"
                >
                  <Eyebrow>Facts stated</Eyebrow>
                  <p className="font-display text-5xl leading-none">
                    {counts.stated}
                    <span className="text-muted-foreground text-2xl">
                      {" "}
                      of {counts.total}
                    </span>
                  </p>
                  <div
                    role="img"
                    aria-label={`${counts.stated} of ${counts.total} facts stated`}
                    className="bg-border h-1.5 w-full overflow-hidden rounded-full"
                  >
                    <div
                      className="bg-primary h-full"
                      style={{
                        width: `${counts.total === 0 ? 0 : (counts.stated / counts.total) * 100}%`,
                      }}
                    />
                  </div>
                  <p className="text-muted-foreground text-xs leading-5">
                    How much of this record has been stated. It says nothing
                    about the property itself.
                    {confirmedByRera > 0
                      ? ` ${confirmedByRera} ${
                          confirmedByRera === 1 ? "fact matches" : "facts match"
                        } the GujRERA record.`
                      : ""}
                  </p>
                </div>
              )}
              <nav
                aria-label="On this page"
                className="border-border border-t pt-5"
              >
                <Eyebrow>On this page</Eyebrow>
                <ul className="mt-3 flex flex-col gap-2 text-sm">
                  {SECTION_LINKS.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        className="text-foreground hover:text-primary underline-offset-4 hover:underline"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </aside>
        </PageSection>

        <div className="flex flex-wrap items-center gap-6 pb-16">
          <Link
            href={BROWSE_PATH}
            className="border-border text-foreground inline-flex items-center rounded-lg border px-4 py-2 text-sm transition-colors hover:border-[var(--color-terracotta)]"
          >
            Back to all properties
          </Link>
          <ReportProblemLink propertyName={dossier.name} />
        </div>
      </PageContainer>
    </PageFrame>
  );
}
