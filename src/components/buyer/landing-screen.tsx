import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GridRow, PageContainer, PageFrame, PageSection } from "./page-frame";
import { BUYER_NAV } from "./site-header";
import { BodyText, DisplayHeading, Eyebrow } from "./typography";

/**
 * The buyer landing page.
 *
 * "Decision-first" in `docs/app-flows/buyer.md` means this page's job is to get
 * a visitor into one of two paths — browse, or guided intake — while telling
 * them enough to know which one they want and what kind of catalog they have
 * arrived at. It is not a marketing page and makes no claim the catalog cannot
 * support.
 *
 * It reads no data, deliberately (DECISIONS.md, 2026-09-07): there is nothing
 * here that varies per request or per visitor, so the most-visited page in the
 * product prerenders at build with no database dependency, and no "featured"
 * ordering is invented that the catalog could not justify.
 *
 * The two destinations come from `BUYER_NAV` rather than being written again
 * here, so the header and the landing page cannot drift apart.
 */

const [BROWSE_NAV, INTAKE_NAV] = BUYER_NAV;

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
    body: "Everything published here comes from a developer submission or a RERA record and passes through review first. Nothing reaches the catalog without it.",
  },
  {
    title: "Gaps are stated, not filled",
    body: "“Not stated” means nobody has answered the question. “Not offered” means the developer answered it. Those are different facts, and this catalog keeps them apart instead of showing a blank.",
  },
  {
    title: "RERA is a cross-check, not a badge",
    body: "A verified indicator names the specific registration it is asserting and appears only when that registration number is on record. It is not a general statement about quality.",
  },
] as const;

export function LandingScreen() {
  return (
    <PageFrame>
      <PageContainer>
        <PageSection className="flex flex-col gap-4">
          <Eyebrow>Ahmedabad and Gujarat</Eyebrow>
          <DisplayHeading level={1} className="max-w-3xl">
            Decide on the facts a developer actually stated.
          </DisplayHeading>
          <BodyText className="text-muted-foreground text-lg">
            PropCompare publishes what developer submissions and RERA records
            say about a property — unit areas, room dimensions, amenities,
            specifications and possession timing — in the same shape for every
            project, so two properties can be compared on the same terms.
          </BodyText>

          <div className="mt-2 flex flex-wrap gap-3">
            <Button asChild size="lg" className="h-11 px-5">
              <Link href={BROWSE_NAV.href}>{BROWSE_NAV.label}</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-11 px-5">
              <Link href={INTAKE_NAV.href}>{INTAKE_NAV.label}</Link>
            </Button>
          </div>
        </PageSection>

        <PageSection
          data-slot="landing-paths"
          className="flex flex-col gap-6 pt-0"
        >
          <GridRow>
            <div className="border-border bg-card flex flex-col gap-3 rounded-lg border p-6 md:col-span-6">
              <DisplayHeading level={3}>Browse the catalog</DisplayHeading>
              <BodyText className="text-muted-foreground text-sm">
                Every published property, filterable by city, locality,
                configuration, possession status and recorded amenities. Each
                one opens into a full dossier of its published facts.
              </BodyText>
              <Link
                href={BROWSE_NAV.href}
                className="text-foreground w-fit text-sm underline underline-offset-4"
              >
                Browse properties
              </Link>
            </div>

            <div className="border-border bg-card flex flex-col gap-3 rounded-lg border p-6 md:col-span-6">
              <DisplayHeading level={3}>
                Start with a few questions
              </DisplayHeading>
              <BodyText className="text-muted-foreground text-sm">
                Say what matters to you — priorities, configuration, city, and a
                budget range you state yourself — to focus the search. Intake is
                optional, and you can browse without it.
              </BodyText>
              <Link
                href={INTAKE_NAV.href}
                className="text-foreground w-fit text-sm underline underline-offset-4"
              >
                Guided start
              </Link>
            </div>
          </GridRow>
        </PageSection>

        <PageSection
          data-slot="landing-principles"
          className="flex flex-col gap-6"
        >
          <DisplayHeading level={2}>How this catalog works</DisplayHeading>
          <GridRow>
            {PRINCIPLES.map((principle) => (
              <div
                key={principle.title}
                data-slot="landing-principle"
                className="flex flex-col gap-2 md:col-span-6"
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

        {/*
         * The price stance gets its own section rather than a footnote. A buyer
         * who cannot find a price will assume the data is broken unless told
         * otherwise, and the footer's one line is not enough to carry it.
         */}
        <PageSection
          data-slot="landing-price-stance"
          className="flex flex-col gap-4"
        >
          <DisplayHeading level={2}>
            Why there are no prices here
          </DisplayHeading>
          <BodyText className="text-muted-foreground">
            Exact prices are commercial data that changes often, and publishing
            them turns a comparison into the marketing race this catalog exists
            to sidestep. PropCompare holds price data privately and uses it only
            to match against a budget range you state during guided intake — the
            result tells you which properties fall within your range, never what
            any of them costs.
          </BodyText>
          <BodyText className="text-muted-foreground">
            Everything else about a property is published in full.
          </BodyText>
        </PageSection>

        <PageSection data-slot="landing-scope" className="flex flex-col gap-4">
          <DisplayHeading level={2}>What is covered</DisplayHeading>
          <BodyText className="text-muted-foreground">
            Apartments, bungalows and plots in Ahmedabad and the rest of
            Gujarat. Only published properties appear — a project is listed once
            its facts have been reviewed, not while they are still being
            checked.
          </BodyText>
          <Button asChild variant="outline" className="h-10 w-fit px-4">
            <Link href={BROWSE_NAV.href}>See what is published</Link>
          </Button>
        </PageSection>
      </PageContainer>
    </PageFrame>
  );
}
