"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { compareAddress, useCompareSelection } from "@/lib/compare/selection";
import { trackEvent } from "@/lib/analytics/track";

/**
 * The comparison tray: docked at the bottom of every buyer page once something is
 * picked. It shows the set, lets any property be removed, and opens the
 * comparison as soon as there are two. It renders nothing until then, so pages
 * without a selection are unchanged, and nothing on `/compare` itself, which
 * already shows the same properties as the comparison it would link to.
 */
export function CompareTray() {
  const pathname = usePathname();
  const { items, remove, clear } = useCompareSelection();
  if (pathname === "/compare" || items.length === 0) return null;
  const ready = items.length >= 2;

  return (
    <>
      {/* Keeps the last of the page from sitting under the tray. */}
      <div aria-hidden="true" className="h-20 md:h-16" />
      <aside
        data-slot="compare-tray"
        aria-label="Properties to compare"
        className="border-border bg-card fixed inset-x-0 bottom-0 z-40 border-t"
      >
        <div className="mx-auto flex max-w-[var(--layout-max-width)] flex-wrap items-center gap-3 px-[var(--layout-margin-mobile)] py-3 md:px-[var(--layout-margin-desktop)]">
          <ul className="flex min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-x-auto [scrollbar-width:none] sm:flex-wrap [&::-webkit-scrollbar]:hidden">
            {items.map((item) => (
              <li
                key={item.slug}
                className="border-border bg-background flex max-w-36 shrink-0 items-center gap-2 rounded-md border py-1 pr-1 pl-1 sm:max-w-56"
              >
                {item.mediaId ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a served thumbnail, not a static asset
                  <img
                    src={`/api/v1/media/${item.mediaId}?size=thumb`}
                    alt=""
                    className="hidden size-8 shrink-0 rounded object-cover sm:block"
                  />
                ) : null}
                <span className="truncate text-sm">{item.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    remove(item.slug);
                    trackEvent("comparison_removed", {
                      slug: item.slug,
                      slugs: items
                        .map((other) => other.slug)
                        .filter((other) => other !== item.slug),
                      detail: { where: "tray" },
                    });
                  }}
                  aria-label={`Remove ${item.name} from the tray`}
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex size-7 shrink-0 items-center justify-center rounded focus-visible:ring-2 focus-visible:outline-none"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3">
            {ready ? null : (
              <p className="text-muted-foreground text-sm">
                Add one more to compare.
              </p>
            )}
            <button
              type="button"
              onClick={clear}
              className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
            >
              Clear
            </button>
            {ready ? (
              <Link
                href={compareAddress(items.map((item) => item.slug))}
                className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center rounded-md px-5 text-sm font-medium"
              >
                Compare ({items.length})
              </Link>
            ) : null}
          </div>
        </div>
      </aside>
    </>
  );
}
