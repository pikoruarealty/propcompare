"use client";

import * as React from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { ZoomableImage } from "@/components/buyer/zoomable-image";
import { cn } from "@/lib/utils";

/**
 * A picture in the review panel that opens full size, in the same zoomable
 * viewer buyers get for floor plans and photos. A reviewer deciding whether a
 * brochure page is the right floor plan needs to read it, and a cropped card
 * thumbnail cannot be read.
 */
export function ExpandableImage({
  src,
  fullSrc,
  alt,
  title,
  className,
}: {
  /** What the card shows. */
  src: string;
  /** What the viewer opens; the card's own picture when it has no larger one. */
  fullSrc?: string;
  alt: string;
  /** The viewer's heading: what this picture is. */
  title: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        aria-label={`Open full size: ${title}`}
        data-slot="expand-image"
        className="focus-visible:ring-ring block w-full cursor-zoom-in focus-visible:ring-2 focus-visible:outline-none"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a served picture or a short-lived signed URL, not a static asset */}
        <img src={src} alt={alt} className={cn(className)} />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[color-mix(in_oklab,var(--color-ink)_75%,transparent)]" />
        <Dialog.Content
          data-slot="image-lightbox"
          aria-describedby={undefined}
          className="bg-card fixed top-1/2 left-1/2 z-50 flex max-h-[92vh] w-[calc(100%-1.5rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-lg border p-4"
        >
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="font-display text-xl">
              {title}
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="text-muted-foreground hover:text-foreground rounded-md p-1"
            >
              <X className="size-5" aria-hidden="true" />
            </Dialog.Close>
          </div>
          {open ? <ZoomableImage src={fullSrc ?? src} alt={alt} /> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
