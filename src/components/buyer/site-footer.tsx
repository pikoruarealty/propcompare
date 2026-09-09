import { PageContainer } from "./page-frame";

/**
 * Buyer footer.
 *
 * The two statements here are product facts, not marketing copy: the catalog
 * is Ahmedabad/Gujarat only (`DECISIONS.md`, 2026-08-31), and no buyer surface
 * shows a price (same file, same date). Saying the second one plainly is worth
 * the space — a buyer who cannot find a price should be told it is a deliberate
 * stance rather than left assuming the data is missing.
 */
export function SiteFooter() {
  return (
    <footer className="border-border bg-background border-t">
      <PageContainer>
        <div className="text-muted-foreground flex flex-col gap-2 py-8 text-sm md:flex-row md:items-start md:justify-between md:gap-16">
          <p>Published property facts for Ahmedabad and Gujarat.</p>
          <p className="max-w-prose md:text-right">
            PropCompare does not publish prices. Facts are drawn from developer
            submissions and RERA records, and are reviewed before publication.
          </p>
        </div>
      </PageContainer>
    </footer>
  );
}
