import Link from "next/link";
import { HeaderAccount } from "./header-account";
import { PageContainer } from "./page-frame";

/**
 * Buyer header.
 *
 * `BUYER_NAV` is exported so the landing page (step 7) and the browse grid
 * (step 5) link to the same destinations the header does, rather than each
 * inventing its own path. The two targets land in later steps of this phase;
 * the shell is built first because every screen in the phase sits inside it.
 */
export const BUYER_NAV = [
  { href: "/properties", label: "Browse properties" },
  { href: "/intake", label: "Guided start" },
  { href: "/compare", label: "Compare" },
] as const;

export function SiteHeader() {
  return (
    <header className="border-border bg-background/85 sticky top-0 z-40 border-b backdrop-blur-md">
      <PageContainer>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 md:h-16 md:py-0">
          <Link
            href="/"
            className="font-display text-foreground text-3xl leading-none tracking-tight"
          >
            PropCompare
          </Link>

          <div className="flex w-full items-center justify-between gap-4 md:w-auto md:gap-6">
            <nav aria-label="Primary">
              <ul className="flex items-center gap-4 text-sm md:gap-6">
                {BUYER_NAV.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-muted-foreground hover:text-foreground whitespace-nowrap transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <HeaderAccount />
          </div>
        </div>
      </PageContainer>
    </header>
  );
}
