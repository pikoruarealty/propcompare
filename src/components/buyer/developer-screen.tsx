import Link from "next/link";
import type { PublicDeveloper } from "@/lib/properties/developer-profile";
import { GridRow, PageContainer, PageFrame, PageSection } from "./page-frame";
import { FactValue } from "./fact-value";
import { PropertyCard } from "./property-card";
import { BodyText, DisplayHeading, Eyebrow } from "./typography";

/** The address of a developer's public profile. */
export const developerHref = (id: string): string => `/developer/${id}`;

/**
 * A developer's public profile: who they are as stated, and the projects
 * published for them. Developer names are not unique, so a name anywhere on the
 * site links here, and this page is what tells two same-named developers apart.
 */
export function DeveloperScreen({ developer }: { developer: PublicDeveloper }) {
  return (
    <PageFrame>
      <PageContainer>
        <PageSection className="flex flex-col gap-5 pb-0 md:pb-0">
          <Eyebrow>Developer</Eyebrow>
          <DisplayHeading level={1}>{developer.name}</DisplayHeading>
          <dl className="grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <dt>
                <Eyebrow>About</Eyebrow>
              </dt>
              <dd className="text-sm">
                <FactValue value={developer.description} />
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt>
                <Eyebrow>Website</Eyebrow>
              </dt>
              <dd className="text-sm">
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
              </dd>
            </div>
          </dl>
        </PageSection>

        <PageSection
          data-slot="developer-projects"
          className="flex flex-col gap-6"
        >
          <DisplayHeading level={2}>
            {developer.properties.length === 1
              ? "1 published project"
              : `${developer.properties.length} published projects`}
          </DisplayHeading>
          {developer.properties.length === 0 ? (
            <BodyText className="text-muted-foreground">
              No project is published for this developer yet.
            </BodyText>
          ) : (
            <GridRow role="list">
              {developer.properties.map((property) => (
                <div
                  key={property.id}
                  role="listitem"
                  className="md:col-span-6 lg:col-span-4"
                >
                  <PropertyCard property={property} />
                </div>
              ))}
            </GridRow>
          )}
          <Link
            href="/properties"
            className="text-primary w-fit text-sm underline underline-offset-4"
          >
            Browse all properties
          </Link>
        </PageSection>
      </PageContainer>
    </PageFrame>
  );
}
