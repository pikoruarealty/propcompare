import * as React from "react";
import { cn } from "@/lib/utils";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

/**
 * The buyer page frame and its grid primitives.
 *
 * The layout numbers are not restated here: `PageContainer` and `GridRow` read
 * `--layout-*` from `globals.css`, which carries the documented 12-column grid,
 * 24px gutters, 48px desktop margins, and 16px mobile margins
 * (`docs/design/design-tokens.md`). A utility class that hard-codes `px-12`
 * would drift from the spec the first time the spec moved; a variable cannot.
 *
 * This is the buyer shell specifically. The developer portal and the admin
 * portal are separate surfaces with their own chrome, per `DECISIONS.md`
 * (2026-08-31) — do not grow this into one shell gated by role.
 */

/**
 * Horizontal frame: documented page margins, centred, capped so long lines
 * stay readable on wide displays.
 */
export function PageContainer({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-container"
      className={cn(
        "mx-auto w-full max-w-[var(--layout-max-width)]",
        "px-[var(--layout-margin-mobile)] md:px-[var(--layout-margin-desktop)]",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The 12-column grid, with the documented gutter. Collapses to a single column
 * below the desktop breakpoint rather than compressing twelve columns into a
 * phone — the design guide explicitly rejects unreadable narrow columns.
 * Children position themselves with `col-span-*`.
 */
export function GridRow({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="grid-row"
      className={cn(
        "grid grid-cols-1 gap-[var(--layout-gutter)] md:grid-cols-12",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Vertical rhythm for a page's main content. Padding steps on the 8px rhythm
 * (32px mobile, 64px desktop).
 */
export function PageSection({
  className,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="page-section"
      className={cn("py-8 md:py-16", className)}
      {...props}
    />
  );
}

/**
 * Header, main, footer. `RootLayout` already makes `body` a full-height flex
 * column, so `flex-1` on `main` is what keeps the footer at the bottom of a
 * short page without absolute positioning.
 */
export function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#main-content"
        className="focus:bg-background focus:text-foreground focus:ring-ring sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:px-3 focus:py-2 focus:ring-2"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
