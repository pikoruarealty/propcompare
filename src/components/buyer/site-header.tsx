import Link from "next/link";
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
] as const;

export function SiteHeader() {
  return (
    <header className="border-border bg-background border-b">
      <PageContainer>
        <div className="flex h-16 items-center justify-between gap-6">
          <Link
            href="/"
            className="font-display text-foreground text-2xl leading-none"
          >
            PropCompare
          </Link>

          <nav aria-label="Primary">
            <ul className="flex items-center gap-6 text-sm">
              {BUYER_NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </PageContainer>
    </header>
  );
}
