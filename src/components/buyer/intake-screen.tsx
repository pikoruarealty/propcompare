import type { FilterOptions } from "@/lib/properties/filter-options";
import { IntakeFlow } from "./intake-flow";
import { PageContainer, PageFrame, PageSection } from "./page-frame";
import { BodyText, DisplayHeading, Eyebrow } from "./typography";

/**
 * `/intake` — the guided start.
 *
 * A Server Component, deliberately. The client boundary is drawn as tightly as
 * it can be: the page frame, the heading, and the standing explanation of what
 * intake does and does not do all render on the server, and only `IntakeFlow` —
 * the part that genuinely needs state — ships to the browser. Wrapping the
 * whole screen in `"use client"` would have pulled the header, the footer, and
 * the typography primitives into the client bundle for no gain.
 *
 * Like every other screen this phase, it is a pure function of its props; the
 * route reads the database and hands the vocabularies in.
 */

export interface IntakeScreenProps {
  options: FilterOptions;
}

export function IntakeScreen({ options }: IntakeScreenProps) {
  return (
    <PageFrame>
      <PageContainer>
        <PageSection className="flex flex-col gap-4">
          <Eyebrow>Guided start</Eyebrow>
          <DisplayHeading level={1} className="max-w-3xl">
            Four questions, then the catalog on your terms.
          </DisplayHeading>
          <BodyText className="text-muted-foreground text-lg">
            Answer as much or as little as you like. Nothing you enter is saved
            or sent anywhere — it stays in this browser tab, and it is gone when
            you close it.
          </BodyText>
        </PageSection>

        <PageSection data-slot="intake" className="pt-0">
          <IntakeFlow options={options} />
        </PageSection>
      </PageContainer>
    </PageFrame>
  );
}
