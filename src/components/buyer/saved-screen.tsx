import Link from "next/link";
import type { ComparisonResult, SavedPropertyEntry } from "@/lib/buyer/types";
import { GridRow, PageContainer, PageFrame, PageSection } from "./page-frame";
import { PropertyCard } from "./property-card";
import { Accent, BodyText, DisplayHeading, Eyebrow } from "./typography";

/**
 * The address that reopens a saved comparison: the properties in their saved
 * order, each with the unit type that was saved.
 */
export const savedComparisonAddress = (
  comparison: ComparisonResult,
): string => {
  const slugs = comparison.items.map((item) => item.property.slug);
  const chosen = comparison.items
    .filter((item) => item.unitVariantId)
    .map((item) => `${item.property.slug}~${item.unitVariantId}`);
  const params = [`p=${slugs.join(",")}`];
  if (chosen.length > 0) params.push(`v=${chosen.join(",")}`);
  return `/compare?${params.join("&")}`;
};

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "Asia/Kolkata",
});

/**
 * A buyer's own list: the properties they saved and the comparisons they saved.
 * Both are only what the buyer chose; nothing here ranks or recommends.
 */
export function SavedScreen({
  properties,
  comparisons,
}: {
  properties: SavedPropertyEntry[];
  comparisons: ComparisonResult[];
}) {
  const empty = properties.length === 0 && comparisons.length === 0;

  return (
    <PageFrame>
      <PageContainer>
        <PageSection className="flex flex-col gap-4 pb-0 md:pb-0">
          <Eyebrow>Saved</Eyebrow>
          <DisplayHeading level={1}>
            Your <Accent>shortlist</Accent>
          </DisplayHeading>
          <BodyText className="text-muted-foreground">
            Properties and comparisons you saved. Open a comparison to see it as
            it was, with the same unit types.
          </BodyText>
        </PageSection>

        {empty ? (
          <PageSection data-slot="saved-empty" className="flex flex-col gap-4">
            <BodyText className="text-muted-foreground">
              Nothing saved yet. Use Save on a property page, or Save this
              comparison on a comparison.
            </BodyText>
            <Link
              href="/properties"
              className="text-primary w-fit text-sm underline underline-offset-4"
            >
              Browse properties
            </Link>
          </PageSection>
        ) : null}

        {comparisons.length > 0 ? (
          <PageSection
            data-slot="saved-comparisons"
            className="flex flex-col gap-6"
          >
            <DisplayHeading level={2}>Comparisons</DisplayHeading>
            <ul className="border-border flex flex-col border-t">
              {[...comparisons].reverse().map((comparison) => (
                <li
                  key={comparison.id}
                  data-slot="saved-comparison"
                  className="border-border flex flex-wrap items-baseline justify-between gap-3 border-b py-4"
                >
                  <Link
                    href={savedComparisonAddress(comparison)}
                    className="font-display text-2xl underline-offset-4 hover:underline"
                  >
                    {comparison.items
                      .map((item) => item.property.name)
                      .join(" against ")}
                  </Link>
                  <span className="text-muted-foreground text-sm">
                    Saved {dateFormat.format(new Date(comparison.createdAt))}
                  </span>
                </li>
              ))}
            </ul>
          </PageSection>
        ) : null}

        {properties.length > 0 ? (
          <PageSection
            data-slot="saved-properties"
            className="flex flex-col gap-6"
          >
            <DisplayHeading level={2}>Properties</DisplayHeading>
            <GridRow role="list">
              {properties.map((entry) => (
                <div
                  key={entry.property.id}
                  role="listitem"
                  className="md:col-span-6 lg:col-span-4"
                >
                  <PropertyCard property={entry.property} />
                </div>
              ))}
            </GridRow>
          </PageSection>
        ) : null}
      </PageContainer>
    </PageFrame>
  );
}
