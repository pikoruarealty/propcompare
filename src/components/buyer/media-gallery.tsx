"use client";

import * as React from "react";
import { Dialog } from "radix-ui";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

/**
 * One picture, as the gallery needs it. `id` is the media id: every image is
 * fetched from `/api/v1/media/{id}` (a fresh short-lived link per request), so no
 * storage path ever reaches the page.
 */
export interface GalleryItem {
  id: string;
  /** Short name for the picture: "Photo", or the unit type for a floor plan. */
  label: string;
  caption: string | null;
  /** Who the image is credited to. */
  attribution: string | null;
}

export interface GallerySection {
  key: string;
  title: string;
  /** Pictures grouped under an optional heading (floor plans, by unit type). */
  groups: { heading: string | null; items: GalleryItem[] }[];
  /** Whether the section starts expanded. */
  open: boolean;
  /** How each picture is fitted in its small card: photos fill it, plans are
   * shown whole. */
  fit: "cover" | "contain";
}

const srcOf = (item: GalleryItem) => `/api/v1/media/${item.id}`;
/** The small version, for cards: a few hundred pixels, not the full picture. */
const thumbOf = (item: GalleryItem) => `${srcOf(item)}?size=thumb`;

const describe = (item: GalleryItem) =>
  item.caption ? `${item.label}: ${item.caption}` : item.label;

/**
 * The property's pictures as expandable sections of small cards. Choosing a card
 * opens a pop-up carousel over that section's pictures (arrow keys and the
 * buttons move, Escape closes), with each picture's credit shown, because images
 * taken from a developer's brochure are published with attribution.
 */
export function MediaGallery({ sections }: { sections: GallerySection[] }) {
  const [open, setOpen] = React.useState<{
    section: string;
    index: number;
  } | null>(null);

  const active = open
    ? sections.find((s) => s.key === open.section)
    : undefined;
  const flat = active ? active.groups.flatMap((group) => group.items) : [];
  const current = open ? flat[open.index] : undefined;

  const move = (delta: number) =>
    setOpen((state) =>
      state && flat.length > 0
        ? {
            ...state,
            index: (state.index + delta + flat.length) % flat.length,
          }
        : state,
    );

  return (
    <div className="flex flex-col gap-4" data-slot="media-gallery">
      {sections.map((section) => {
        const count = section.groups.reduce(
          (total, group) => total + group.items.length,
          0,
        );
        let offset = 0;
        return (
          <details
            key={section.key}
            open={section.open}
            data-slot="media-section"
            data-section={section.key}
            className="border-border bg-card group rounded-lg border"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4">
              <span className="font-display text-xl">
                {section.title}{" "}
                <span className="text-muted-foreground font-sans text-sm">
                  ({count})
                </span>
              </span>
              <span
                aria-hidden="true"
                className="text-muted-foreground text-sm group-open:hidden"
              >
                Show
              </span>
              <span
                aria-hidden="true"
                className="text-muted-foreground hidden text-sm group-open:inline"
              >
                Hide
              </span>
            </summary>
            <div className="flex flex-col gap-5 px-4 pb-4">
              {section.groups.map((group) => {
                const start = offset;
                offset += group.items.length;
                return (
                  <div
                    key={group.heading ?? "all"}
                    className="flex flex-col gap-2"
                  >
                    {group.heading ? (
                      <h3 className="text-muted-foreground text-xs font-semibold tracking-[0.1em] uppercase">
                        {group.heading}
                      </h3>
                    ) : null}
                    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                      {group.items.map((item, position) => (
                        <li key={item.id} data-slot="media-item">
                          <button
                            type="button"
                            onClick={() =>
                              setOpen({
                                section: section.key,
                                index: start + position,
                              })
                            }
                            aria-label={`Open ${describe(item)}, ${
                              start + position + 1
                            } of ${count}`}
                            className="border-border bg-muted focus-visible:ring-ring block aspect-[4/3] w-full overflow-hidden rounded-md border focus-visible:ring-2 focus-visible:outline-none"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={thumbOf(item)}
                              alt=""
                              loading="lazy"
                              className={
                                section.fit === "cover"
                                  ? "size-full object-cover"
                                  : "size-full object-contain"
                              }
                            />
                          </button>
                          <p className="text-foreground mt-1 truncate text-xs">
                            {item.caption ?? item.label}
                          </p>
                          {item.attribution ? (
                            <p
                              data-slot="card-credit"
                              className="text-muted-foreground truncate text-[11px]"
                            >
                              Credit: {item.attribution}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </details>
        );
      })}

      <Dialog.Root
        open={current !== undefined}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-[color-mix(in_oklab,var(--color-ink)_75%,transparent)]" />
          <Dialog.Content
            data-slot="media-lightbox"
            aria-describedby={undefined}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") move(1);
              if (event.key === "ArrowLeft") move(-1);
            }}
            className="bg-card fixed top-1/2 left-1/2 z-50 flex max-h-[92vh] w-[calc(100%-1.5rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-lg border p-4 shadow-[0_4px_20px_color-mix(in_oklab,var(--color-ink)_20%,transparent)]"
          >
            <div className="flex items-start justify-between gap-4">
              <Dialog.Title className="font-display text-xl">
                {current ? describe(current) : ""}
              </Dialog.Title>
              <Dialog.Close
                aria-label="Close"
                className="text-muted-foreground hover:text-foreground rounded-md p-1"
              >
                <X className="size-5" aria-hidden="true" />
              </Dialog.Close>
            </div>
            {current ? (
              <div className="bg-muted flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={srcOf(current)}
                  alt={describe(current)}
                  className="max-h-[68vh] w-auto max-w-full object-contain"
                />
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-4 text-sm">
              <p className="text-muted-foreground min-w-0">
                {current?.attribution ? (
                  <span data-slot="lightbox-credit">
                    Credit: {current.attribution}
                  </span>
                ) : null}
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  aria-label="Previous picture"
                  disabled={flat.length < 2}
                  onClick={() => move(-1)}
                  className="border-border rounded-md border p-2 disabled:opacity-40"
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                </button>
                <span
                  data-slot="lightbox-position"
                  className="text-muted-foreground tabular-nums"
                >
                  {open ? open.index + 1 : 0} of {flat.length}
                </span>
                <button
                  type="button"
                  aria-label="Next picture"
                  disabled={flat.length < 2}
                  onClick={() => move(1)}
                  className="border-border rounded-md border p-2 disabled:opacity-40"
                >
                  <ChevronRight className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
