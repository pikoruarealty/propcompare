"use client";

import * as React from "react";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImageLayout, PageSuggestion } from "@/lib/ocr/page-router";
import {
  inputClass,
  labelClass,
} from "@/components/admin/submission/form-classes";

export const IMAGE_LAYOUT_LABEL: Record<ImageLayout, string> = {
  full_page: "Image fills the page",
  multiple_images: "Several images",
  single_with_decoration: "One image with decoration",
};

/** Imagery worth offering as an image; a page with only a logo is not. */
const WORTH_USING = new Set([
  "exterior_render",
  "amenity_photo",
  "interior",
  "floor_plan",
  "site_plan",
  "location_map",
]);

/**
 * Whether to offer "use this page as an image". Everywhere when the brochure has
 * not been categorized yet (nothing is known, and the admin may want any page),
 * otherwise only on pages the router saw real imagery on or called a floor plan.
 */
export const offersPageImage = (suggestion: PageSuggestion | undefined) =>
  suggestion === undefined ||
  suggestion.category === "floor_plan" ||
  suggestion.imagery.some((tag) => WORTH_USING.has(tag));

/**
 * Turns one whole brochure page into an image candidate for the submission. The
 * page is rendered on the server and lands in the submission's images as private
 * and unreviewed, credited to the developer; a reviewer still approves it before
 * it can go live. Suits floor plans and full-page photos; a page with several
 * pictures on it is added whole (extracting single pictures is a later step).
 */
export function PageImageAction({
  submissionId,
  page,
  suggestion,
  suggestedType,
  defaultCaption,
}: {
  submissionId: string;
  page: number;
  suggestion: PageSuggestion | undefined;
  /** What the admin has marked this page as, if anything. */
  suggestedType?: string;
  /**
   * The caption to default "Unit type" to — the router's own suggestion
   * where still available, otherwise a caption a previous confirm already
   * persisted onto this page's `OcrRoutedPage.label`.
   */
  defaultCaption?: string;
}) {
  const defaultType: "photo" | "floor_plan" =
    suggestedType === "floor_plan" || suggestion?.category === "floor_plan"
      ? "floor_plan"
      : "photo";
  const [open, setOpen] = React.useState(false);
  const [mediaType, setMediaType] = React.useState(defaultType);
  const [unit, setUnit] = React.useState(
    defaultCaption ?? suggestion?.caption ?? "",
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [added, setAdded] = React.useState(false);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v1/admin/submissions/${submissionId}/media/from-page`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pageNumber: page,
            mediaType,
            ...(unit.trim() ? { unitVariantName: unit.trim() } : {}),
          }),
        },
      );
      if (response.ok || response.status === 409) {
        // A 409 here means it was already added — say so rather than fail.
        setAdded(true);
        setOpen(false);
        return;
      }
      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(
        payload?.error?.message ?? "That page could not be added as an image.",
      );
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  if (added) {
    // One short line: the page card is narrow, so it must not wrap.
    return (
      <p
        className="flex items-center gap-2 text-xs whitespace-nowrap"
        role="status"
      >
        <span>Added</span>
        <span aria-hidden="true">·</span>
        <Link
          href={`/admin/submissions/${submissionId}`}
          className="underline underline-offset-4"
        >
          Review
        </Link>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {suggestion?.imageLayout ? (
        <p className="text-muted-foreground text-xs">
          {IMAGE_LAYOUT_LABEL[suggestion.imageLayout]}
        </p>
      ) : null}
      <Dialog.Root open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <Dialog.Trigger asChild>
          <Button type="button" variant="outline" size="sm">
            <ImagePlus /> Use as image
          </Button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-[color-mix(in_oklab,var(--color-ink)_55%,transparent)]" />
          <Dialog.Content
            aria-describedby={undefined}
            className="bg-background fixed top-1/2 left-1/2 z-50 w-[min(calc(100vw-2rem),28rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border p-6"
          >
            <Dialog.Title className="font-display text-2xl">
              Use page {page} as an image
            </Dialog.Title>
            <p className="text-muted-foreground mt-1 text-sm">
              The whole page is added to this listing&rsquo;s images, credited
              to the developer. You can review it before it goes live.
            </p>
            <form
              onSubmit={add}
              className="mt-5 flex flex-col gap-4"
              aria-label={`Use page ${page} as an image`}
            >
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>It is</span>
                <select
                  className={`${inputClass} h-11`}
                  value={mediaType}
                  onChange={(e) =>
                    setMediaType(e.target.value as typeof mediaType)
                  }
                >
                  <option value="photo">A photo</option>
                  <option value="floor_plan">A floor plan</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>Unit type (optional)</span>
                <input
                  className={`${inputClass} h-11`}
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="e.g. 3 BHK - A"
                />
              </label>
              {error ? (
                <p role="alert" className="text-destructive text-sm">
                  {error}
                </p>
              ) : null}
              <div className="mt-2 flex justify-end gap-3">
                <Dialog.Close asChild>
                  <Button type="button" variant="outline" disabled={busy}>
                    Cancel
                  </Button>
                </Dialog.Close>
                <Button type="submit" disabled={busy}>
                  {busy ? "Adding…" : "Add image"}
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
