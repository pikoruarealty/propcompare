import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  BROWSE_PATH,
  POSSESSION_STATUS_LABEL,
  formatPossessionDate,
  propertyDossierHref,
} from "@/lib/properties/browse";
import type { PropertySummary } from "@/lib/properties/types";
import { CompareToggle } from "./compare-toggle";
import { FactValue } from "./fact-value";
import { GridRow, PageContainer, PageFrame, PageSection } from "./page-frame";
import { PropertyCard } from "./property-card";
import { BUYER_NAV } from "./site-header";
import { Accent, BodyText, DisplayHeading, Eyebrow } from "./typography";

/**
 * The buyer landing page.
 *
 * Its job is to make a first-time visitor feel this will help them decide, and
 * to lead them to the one thing the product exists for: putting homes side by
 * side. It does that with a split hero (an expressive line on the left, a real
 * published residence on the right), three cards on how a decision gets made
 * here, and the most recently published properties with their Compare buttons.
 *
 * The page is a pure function of that list — `src/app/page.tsx` reads it — so
 * the populated and the empty catalog are both testable without a database. The
 * strip is "recently published", the catalog's own `newest` order: "featured"
 * or "best" would be an assessment nothing here supports (DECISIONS.md,
 * 2026-09-07). The hero shows the newest property that has a photograph, and
 * says nothing more about it than the card does.
 *
 * What the copy may claim: facts are read from developers' brochures and
 * cross-checked against the RERA register, then reviewed before publication.
 * It must not say they come from "developer submissions" (they are extracted
 * from brochures, and an admin reviews them).
 *
 * The two destinations come from `BUYER_NAV` rather than being written again
 * here, so the header and the landing page cannot drift apart.
 */

const [BROWSE_NAV, INTAKE_NAV] = BUYER_NAV;

/** How a decision gets made here, in three steps. Set as a list, not as cards. */
const HOW_YOU_DECIDE = [
  {
    title: "Put homes next to each other",
    body: "Pick two or three properties, and a unit type in each. Three BHK against three BHK, never a project against a flat.",
  },
  {
    title: "See only what differs",
    body: "Identical facts are folded away. What is left is the real difference in area, rooms, possession and specification, with what would change if you chose one over the other.",
  },
  {
    title: "Know what nobody stated",
    body: "A blank is never hidden. “Not stated” and “not offered” are different facts, and each row shows where its value came from.",
  },
] as const;

/**
 * The four things a buyer needs to understand about this catalog before its
 * gaps read as defects. Each is a restatement of a rule the product actually
 * enforces elsewhere in the codebase, not a promise.
 */
const PRINCIPLES = [
  {
    title: "Areas are never converted",
    body: "Carpet, built-up and super built-up are shown separately, and a basis nobody published is left unstated rather than derived from another. Two brochures quoting different bases are not comparable until you can see which is which.",
  },
  {
    title: "Facts are reviewed before they appear",
    body: "Everything published here is read from the developer’s brochure, cross-checked against the RERA register, and reviewed by a person before it goes live. Nothing reaches the catalog without it.",
  },
  {
    title: "Gaps are stated, not filled",
    body: "“Not stated” means nobody has answered the question. “Not offered” means the developer answered it. Those are different facts, and this catalog keeps them apart instead of showing a blank.",
  },
  {
    title: "RERA is a cross-check",
    body: "A verified indicator names the specific registration it is asserting and appears only when that registration number is on record. It is not a general statement about quality.",
  },
] as const;

export interface LandingScreenProps {
  /**
   * The most recently published properties, newest first. An empty list is a
   * real state, not a failure: the catalog starts empty and the page has to
   * read correctly before anything is published.
   */
  recent: PropertySummary[];
}

export function LandingScreen({ recent }: LandingScreenProps) {
  const hero =
    recent.find((p) => p.primaryMedia?.mediaType === "photo") ?? null;

  return (
    <PageFrame>
      <PageContainer>
        <section
          data-slot="landing-hero"
          className="grid items-center gap-10 py-10 md:py-16 lg:grid-cols-12 lg:gap-12"
        >
          <div className="flex flex-col gap-6 lg:col-span-7">
            <Eyebrow className="text-primary">Ahmedabad and Gujarat</Eyebrow>
            <DisplayHeading level={1} size="hero">
              The right home is <Accent>a comparison away.</Accent>
            </DisplayHeading>
            <BodyText className="text-muted-foreground max-w-xl text-lg leading-8">
              Put two or three homes next to each other and see what actually
              differs. Every fact is read from the developer’s brochure,
              cross-checked against the RERA register, and stated in the same
              shape for every project.
            </BodyText>

            <div className="flex flex-wrap gap-3 pt-2">
              <Button asChild size="xl">
                <Link href={BROWSE_NAV.href}>Choose homes to compare</Link>
              </Button>
              <Button asChild variant="outline" size="xl">
                <Link href={INTAKE_NAV.href}>{INTAKE_NAV.label}</Link>
              </Button>
            </div>
            <p className="text-muted-foreground text-sm">
              No sign-in to compare. Intake is optional, and you can browse
              without it.
            </p>
          </div>

          <div className="lg:col-span-5">
            {hero ? <HeroResidence property={hero} /> : <HeroPlaceholder />}
          </div>
        </section>
      </PageContainer>

      {recent.length >= 2 ? (
        <PageContainer>
          <ComparisonExcerpt a={recent[0]} b={recent[1]} />
        </PageContainer>
      ) : null}

      <section
        data-slot="landing-how"
        className="bg-tone-sage border-border border-y"
      >
        <PageContainer>
          <PageSection>
            <GridRow>
              <div className="flex flex-col gap-3 md:col-span-5">
                <Eyebrow>How you decide</Eyebrow>
                <DisplayHeading level={2}>
                  From two brochures to <Accent>one clear table.</Accent>
                </DisplayHeading>
              </div>
              <ol className="flex flex-col md:col-span-7">
                {HOW_YOU_DECIDE.map(({ title, body }, index) => (
                  <li
                    key={title}
                    data-slot="landing-step"
                    className="border-border grid grid-cols-[3.5rem_1fr] gap-4 border-t py-6 first:border-t-0 first:pt-0"
                  >
                    <span
                      aria-hidden="true"
                      className="font-display text-primary text-5xl leading-none"
                    >
                      {index + 1}
                    </span>
                    <div className="flex flex-col gap-2">
                      <DisplayHeading level={3}>{title}</DisplayHeading>
                      <BodyText className="text-muted-foreground text-sm">
                        {body}
                      </BodyText>
                    </div>
                  </li>
                ))}
              </ol>
            </GridRow>
          </PageSection>
        </PageContainer>
      </section>

      {/*
       * Recently published, in the catalog's own `newest` order. The section
       * disappears entirely when nothing is published, rather than rendering an
       * empty shelf that reads as a broken page.
       */}
      {recent.length > 0 ? (
        <PageContainer>
          <PageSection
            data-slot="landing-recent"
            className="flex flex-col gap-8"
          >
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-col gap-3">
                <Eyebrow>Start here</Eyebrow>
                <DisplayHeading level={2}>Recently published</DisplayHeading>
              </div>
              <Link
                href={BROWSE_PATH}
                className="text-primary text-sm font-medium underline underline-offset-4"
              >
                See the whole catalog
              </Link>
            </div>
            <GridRow role="list">
              {recent.map((property) => (
                <div
                  key={property.id}
                  role="listitem"
                  className="md:col-span-6 lg:col-span-4"
                >
                  <PropertyCard property={property} />
                </div>
              ))}
            </GridRow>
          </PageSection>
        </PageContainer>
      ) : null}

      <section className="bg-tone-deep border-border border-y">
        <PageContainer>
          <PageSection
            data-slot="landing-principles"
            className="flex flex-col gap-10"
          >
            <div className="flex max-w-2xl flex-col gap-3">
              <Eyebrow>Where the facts come from</Eyebrow>
              <DisplayHeading level={2}>
                Read from brochures. <Accent>Checked against RERA.</Accent>
              </DisplayHeading>
              <BodyText className="text-muted-foreground">
                A brochure says what a developer wants you to see. Here every
                value is read from it, set beside the regulator’s record, and
                reviewed before it is published.
              </BodyText>
            </div>
            <GridRow>
              {PRINCIPLES.map((principle) => (
                <div
                  key={principle.title}
                  data-slot="landing-principle"
                  className="border-border flex flex-col gap-2 border-t pt-5 md:col-span-6"
                >
                  <DisplayHeading level={3} className="text-2xl">
                    {principle.title}
                  </DisplayHeading>
                  <BodyText className="text-muted-foreground text-sm">
                    {principle.body}
                  </BodyText>
                </div>
              ))}
            </GridRow>
          </PageSection>
        </PageContainer>
      </section>

      <PageContainer>
        <PageSection className="grid items-center gap-8 md:grid-cols-12">
          <div
            data-slot="landing-price-stance"
            className="flex flex-col gap-4 md:col-span-7"
          >
            <Eyebrow>No prices, on purpose</Eyebrow>
            <DisplayHeading level={2}>
              Why there are no prices here
            </DisplayHeading>
            <BodyText className="text-muted-foreground">
              Exact prices are commercial data that changes often, and
              publishing them turns a comparison into the marketing race this
              catalog exists to sidestep. PropCompare holds price data privately
              and uses it only to match against a budget range you state during
              guided intake. The result tells you which properties fall within
              your range, never what any of them costs.
            </BodyText>
            <BodyText className="text-muted-foreground">
              Everything else about a property is published in full, for
              apartments, bungalows and plots in Ahmedabad and the rest of
              Gujarat.
            </BodyText>
          </div>
          <div className="bg-tone-terracotta flex flex-col items-start gap-4 rounded-lg p-8 md:col-span-5">
            <DisplayHeading level={3}>Ready to compare?</DisplayHeading>
            <BodyText className="text-muted-foreground text-sm">
              Choose two or three homes and see what changes between them.
            </BodyText>
            <Button asChild size="lg" className="h-11 px-5">
              <Link href={BROWSE_NAV.href}>See what is published</Link>
            </Button>
          </div>
        </PageSection>
      </PageContainer>
    </PageFrame>
  );
}

/**
 * The hero picture: a real published residence, large, with its name over the
 * photograph and a Compare button. Served through the media route like every
 * picture, so its credit and review rules apply.
 */
function HeroResidence({ property }: { property: PropertySummary }) {
  const media = property.primaryMedia;
  return (
    <figure
      data-slot="landing-hero-image"
      className="relative aspect-[4/5] overflow-hidden rounded-lg"
    >
      {media ? (
        // eslint-disable-next-line @next/next/no-img-element -- served through the media route, never by storage path
        <img
          src={`/api/v1/media/${media.id}`}
          alt={`${property.name}, ${property.locality}`}
          className="size-full object-cover"
          fetchPriority="high"
        />
      ) : null}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent"
      />
      <figcaption className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-6 text-white">
        <div>
          <p className="text-xs font-medium tracking-[0.08em] uppercase opacity-80">
            {property.locality}, {property.city}
          </p>
          <Link
            href={propertyDossierHref(property.slug)}
            className="font-display text-4xl leading-tight after:absolute after:inset-0 after:content-['']"
          >
            {property.name}
          </Link>
          <p className="text-sm opacity-80">{property.developer.name}</p>
        </div>
        <div className="relative z-10">
          <CompareToggle
            slug={property.slug}
            name={property.name}
            mediaId={media?.id ?? null}
          />
        </div>
      </figcaption>
    </figure>
  );
}

/** Before anything is published there is no photograph to show; keep the frame. */
function HeroPlaceholder() {
  return (
    <div
      aria-hidden="true"
      data-slot="landing-hero-image"
      className="bg-tone-sage border-border flex aspect-[4/5] items-center justify-center rounded-lg border"
    ></div>
  );
}

/**
 * A real excerpt of a comparison, built from the two newest published
 * properties' stored facts, so the page shows the product rather than a picture
 * of it. Only facts the summary carries appear; `/compare` shows every fact and
 * compares unit type against unit type.
 */
function ComparisonExcerpt({
  a,
  b,
}: {
  a: PropertySummary;
  b: PropertySummary;
}) {
  const rows: {
    label: string;
    cell: (p: PropertySummary) => React.ReactNode;
  }[] = [
    { label: "Locality", cell: (p) => `${p.locality}, ${p.city}` },
    {
      label: "Configurations",
      cell: (p) =>
        p.bhkTypes.length === 0 ? (
          <FactValue status="not_stated" />
        ) : (
          p.bhkTypes.map((t) => t.label).join(", ")
        ),
    },
    {
      label: "Possession",
      cell: (p) => (
        <FactValue
          value={
            p.possessionStatus === null
              ? null
              : POSSESSION_STATUS_LABEL[p.possessionStatus]
          }
        />
      ),
    },
    {
      label: "Possession date",
      cell: (p) => (
        <FactValue value={formatPossessionDate(p.possessionDate)} tabular />
      ),
    },
  ];
  const href = `/compare?p=${a.slug},${b.slug}`;

  return (
    <PageSection
      data-slot="landing-excerpt"
      className="flex flex-col gap-8 pt-0"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-3">
          <Eyebrow>The comparison, as it looks</Eyebrow>
          <DisplayHeading level={2}>
            {a.name} and {b.name}
          </DisplayHeading>
        </div>
        <Link
          href={href}
          className="text-primary text-sm font-medium underline underline-offset-4"
        >
          Compare these two in full
        </Link>
      </div>
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">
          Published facts for {a.name} and {b.name}, side by side
        </caption>
        <thead>
          <tr className="border-border border-b">
            <th scope="col" className="w-1/5 py-3 pr-4" />
            <th
              scope="col"
              className="font-display py-3 pr-4 text-2xl font-normal"
            >
              {a.name}
            </th>
            <th scope="col" className="font-display py-3 text-2xl font-normal">
              {b.name}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-border border-b">
              <th
                scope="row"
                className="text-muted-foreground py-4 pr-4 text-xs font-medium tracking-[0.08em] uppercase"
              >
                {row.label}
              </th>
              <td className="py-4 pr-4">{row.cell(a)}</td>
              <td className="py-4">{row.cell(b)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </PageSection>
  );
}
