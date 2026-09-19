"use client";

import * as React from "react";
import Link from "next/link";
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
}: {
  submissionId: string;
  page: number;
  suggestion: PageSuggestion | undefined;
  /** What the admin has marked this page as, if anything. */
  suggestedType?: string;
}) {
  const defaultType: "photo" | "floor_plan" =
    suggestedType === "floor_plan" || suggestion?.category === "floor_plan"
      ? "floor_plan"
      : "photo";
  const [open, setOpen] = React.useState(false);
  const [mediaType, setMediaType] = React.useState(defaultType);
  const [unit, setUnit] = React.useState(suggestion?.caption ?? "");
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
    return (
      <p className="text-xs" role="status">
        Added to the images.{" "}
        <Link
          href={`/admin/submissions/${submissionId}`}
          className="underline underline-offset-4"
        >
          Review it
        </Link>
      </p>
    );
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-1">
        {suggestion?.imageLayout ? (
          <p className="text-muted-foreground text-xs">
            {IMAGE_LAYOUT_LABEL[suggestion.imageLayout]}
          </p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
        >
          <ImagePlus /> Use as image
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={add}
      className="border-border bg-background flex flex-col gap-3 rounded-md border p-3"
      aria-label={`Use page ${page} as an image`}
    >
      <label className="flex flex-col gap-1">
        <span className={labelClass}>It is</span>
        <select
          className={`${inputClass} h-9 text-sm`}
          value={mediaType}
          onChange={(e) => setMediaType(e.target.value as typeof mediaType)}
        >
          <option value="photo">A photo</option>
          <option value="floor_plan">A floor plan</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Unit type (optional)</span>
        <input
          className={`${inputClass} h-9 text-sm`}
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder="e.g. 3 BHK - A"
        />
      </label>
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Adding…" : "Add image"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
          disabled={busy}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
