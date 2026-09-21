import { cn } from "@/lib/utils";
import { PageContainer, PageFrame, PageSection } from "./page-frame";

/**
 * What a buyer page shows while its data loads: the same frame, and blocks the
 * size of what is coming, so nothing jumps when the page arrives. Tonal blocks
 * only (`docs/design/no-vibecoded-tells.v1.md`, rule 21); the single pulse is
 * the loading state itself, not decoration, and stops for people who ask for
 * reduced motion.
 */
function Block({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "bg-tone-deep border-border animate-pulse rounded-lg border motion-reduce:animate-none",
        className,
      )}
    />
  );
}

const CARD_COUNT = 3;

/** A heading, a filter band and a row of cards: browse, and the landing strip. */
export function ListSkeleton() {
  return (
    <PageFrame>
      <PageContainer>
        <PageSection
          className="flex flex-col gap-8"
          aria-busy="true"
          aria-label="Loading"
        >
          <div className="flex flex-col gap-3">
            <Block className="h-4 w-24 border-0" />
            <Block className="h-14 w-full max-w-md border-0" />
            <Block className="h-16 w-full max-w-xl border-0" />
          </div>
          <Block className="h-40 w-full" />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: CARD_COUNT }, (_, i) => (
              <Block key={i} className="h-96" />
            ))}
          </div>
        </PageSection>
      </PageContainer>
    </PageFrame>
  );
}

/** The opening plate, the key-facts band and the first sections: the dossier. */
export function DossierSkeleton() {
  return (
    <PageFrame>
      <PageContainer>
        <div
          aria-busy="true"
          aria-label="Loading"
          className="flex flex-col gap-8 pt-10 pb-16"
        >
          <Block className="h-[26rem] w-full md:h-[32rem]" />
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <Block key={i} className="h-16 border-0" />
            ))}
          </div>
          <div className="grid gap-12 lg:grid-cols-12">
            <div className="flex flex-col gap-8 lg:col-span-8">
              <Block className="h-10 w-64 border-0" />
              <Block className="h-72 w-full" />
              <Block className="h-10 w-48 border-0" />
              <Block className="h-96 w-full" />
            </div>
            <Block className="h-72 lg:col-span-4" />
          </div>
        </div>
      </PageContainer>
    </PageFrame>
  );
}

/** A heading and one wide table: the comparison. */
export function TableSkeleton() {
  return (
    <PageFrame>
      <PageContainer>
        <div
          aria-busy="true"
          aria-label="Loading"
          className="flex flex-col gap-6 pt-10 pb-16"
        >
          <Block className="h-14 w-full max-w-lg border-0" />
          <Block className="h-24 w-full" />
          <Block className="h-[32rem] w-full" />
        </div>
      </PageContainer>
    </PageFrame>
  );
}
