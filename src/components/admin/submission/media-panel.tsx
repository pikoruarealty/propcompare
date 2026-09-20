"use client";

import * as React from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SubmissionDetail } from "@/lib/submissions/queue";
import { REVIEW_STATUS_LABEL } from "@/lib/submissions/field-display";
import { inputClass, labelClass } from "./form-classes";

export type MediaItem = SubmissionDetail["media"][number] & {
  /** A short-lived link the page made for showing the image. */
  previewUrl: string | null;
};

const SOURCE_LABEL: Record<string, string> = {
  own: "Our own image",
  developer_supplied: "Supplied by the developer",
  developer_brochure: "From the developer's brochure",
};

/**
 * Images proposed for the listing: those taken from the brochure and any the
 * admin adds themselves. Nothing here is public until it has been reviewed and
 * the submission is published; a new upload always starts private and unreviewed,
 * and must carry an attribution.
 */
export function MediaPanel({
  submissionId,
  published,
  removedIds,
  onSetRemoved,
  media,
  variantNames,
  editable,
  inReview,
  pending,
  onReview,
  onUploaded,
}: {
  submissionId: string;
  /** Pictures live for buyers now (an edit of a published property only). */
  published: SubmissionDetail["publishedMedia"];
  /** The live pictures this edit takes off the listing. */
  removedIds: string[];
  /** Saves the new list of pictures to take off; resolves to an error message. */
  onSetRemoved: (ids: string[]) => Promise<string | null>;
  media: MediaItem[];
  variantNames: string[];
  editable: boolean;
  inReview: boolean;
  pending: boolean;
  onReview: (
    mediaId: string,
    status: "confirmed" | "rejected",
    isPublic: boolean,
  ) => void;
  onUploaded: () => void;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [mediaType, setMediaType] = React.useState<"photo" | "floor_plan">(
    "photo",
  );
  const [sourceKind, setSourceKind] = React.useState<
    "own" | "developer_supplied"
  >("own");
  const [attribution, setAttribution] = React.useState("");
  const [caption, setCaption] = React.useState("");
  const [variant, setVariant] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [removeError, setRemoveError] = React.useState<string | null>(null);
  const setRemoved = async (id: string, remove: boolean) => {
    setRemoveError(null);
    const next = remove
      ? [...removedIds, id]
      : removedIds.filter((existing) => existing !== id);
    setRemoveError(await onSetRemoved(next));
  };

  const upload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return setError("Choose an image to upload.");
    if (!attribution.trim()) {
      return setError("Say who the image should be credited to.");
    }
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("mediaType", mediaType);
      body.set("sourceKind", sourceKind);
      body.set("attribution", attribution);
      if (caption.trim()) body.set("caption", caption);
      if (variant) body.set("unitVariantName", variant);
      const response = await fetch(
        `/api/v1/admin/submissions/${submissionId}/media`,
        {
          method: "POST",
          body,
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        return setError(
          payload?.error?.message ?? "The image could not be uploaded.",
        );
      }
      setFile(null);
      setCaption("");
      if (fileInput.current) fileInput.current.value = "";
      onUploaded();
    } catch {
      setError("The upload failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="media-heading">
      <h2 id="media-heading" className="font-display text-2xl">
        Images
      </h2>
      <p className="text-muted-foreground mt-1 mb-4 text-sm">
        Photos and floor plans for the listing. Each is reviewed before it can
        go live, and shows its attribution.
      </p>

      {published.length > 0 ? (
        <div data-slot="published-pictures" className="mb-8">
          <h3 className="font-display text-xl">Pictures on the listing now</h3>
          <p className="text-muted-foreground mt-1 mb-3 text-sm">
            {editable
              ? "Taking one off hides it from buyers when this edit is published; nothing is deleted. To replace a picture, take it off and add the new one below."
              : "These are live for buyers now."}
          </p>
          {removeError ? (
            <p role="alert" className="text-destructive mb-3 text-sm">
              {removeError}
            </p>
          ) : null}
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {published.map((item) => {
              const removed = removedIds.includes(item.id);
              const isImage =
                item.mediaType === "photo" || item.mediaType === "floor_plan";
              return (
                <li
                  key={item.id}
                  data-slot="published-picture"
                  data-removed={removed}
                  className="border-border bg-card overflow-hidden rounded-lg border"
                >
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a served thumbnail, not a static asset
                    <img
                      src={`/api/v1/media/${item.id}?size=thumb`}
                      alt={item.caption ?? "A picture on the listing"}
                      className={
                        removed
                          ? "bg-muted aspect-[3/2] w-full object-cover opacity-40 grayscale"
                          : "bg-muted aspect-[3/2] w-full object-cover"
                      }
                    />
                  ) : (
                    <div className="bg-muted text-muted-foreground flex aspect-[3/2] items-center justify-center text-sm">
                      {item.mediaType === "video" ? "Video" : "Document"}
                    </div>
                  )}
                  <div className="flex flex-col gap-2 p-4">
                    <p className="font-medium">
                      {item.mediaType === "floor_plan"
                        ? "Floor plan"
                        : item.mediaType === "photo"
                          ? "Photo"
                          : item.mediaType === "video"
                            ? "Video"
                            : "Brochure"}
                      {item.unitVariantName ? ` · ${item.unitVariantName}` : ""}
                    </p>
                    {item.caption ? (
                      <p className="text-sm">{item.caption}</p>
                    ) : null}
                    {item.attribution ? (
                      <p className="text-muted-foreground text-xs">
                        Credit: {item.attribution}
                      </p>
                    ) : null}
                    {removed ? (
                      <p className="text-destructive text-sm font-medium">
                        Comes off the listing when this is published.
                      </p>
                    ) : null}
                    {editable ? (
                      <div className="pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() => void setRemoved(item.id, !removed)}
                        >
                          {removed
                            ? "Keep this picture"
                            : "Take off the listing"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <h3 className="font-display text-xl">Pictures proposed in this edit</h3>
      {media.length === 0 ? (
        <p className="border-border bg-card text-muted-foreground rounded-lg border p-6 text-sm">
          No images yet.
          {editable ? " Add your own below." : ""}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {media.map((item) => (
            <li
              key={item.id}
              className="border-border bg-card overflow-hidden rounded-lg border"
            >
              {item.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL to private storage, not a static asset
                <img
                  src={item.previewUrl}
                  alt={
                    item.caption ??
                    `${item.mediaType.replace("_", " ")} proposed for the listing`
                  }
                  className="bg-muted aspect-[3/2] w-full object-cover"
                />
              ) : (
                <div className="bg-muted text-muted-foreground flex aspect-[3/2] items-center justify-center text-sm">
                  No preview
                </div>
              )}
              <div className="flex flex-col gap-2 p-4">
                <p className="font-medium">
                  {item.mediaType === "floor_plan" ? "Floor plan" : "Photo"}
                  {item.unitVariantName ? ` · ${item.unitVariantName}` : ""}
                </p>
                {item.caption ? (
                  <p className="text-sm">{item.caption}</p>
                ) : null}
                <p className="text-muted-foreground text-xs">
                  {SOURCE_LABEL[item.sourceKind] ?? item.sourceKind} · Credit:{" "}
                  {item.attribution}
                </p>
                <p className="text-muted-foreground text-xs">
                  {REVIEW_STATUS_LABEL[item.reviewStatus] ?? item.reviewStatus}
                  {item.reviewStatus === "confirmed"
                    ? item.isPublic
                      ? " · will be public"
                      : " · kept private"
                    : ""}
                </p>
                {inReview ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending}
                      onClick={() => onReview(item.id, "confirmed", true)}
                    >
                      Approve
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => onReview(item.id, "rejected", false)}
                    >
                      Reject
                    </Button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editable ? (
        <form
          onSubmit={upload}
          className="border-border bg-card mt-6 flex flex-col gap-4 rounded-lg border p-5"
          noValidate
        >
          <p className="font-display text-xl">Add your own image</p>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className={labelClass}>Image (JPEG, PNG or WebP)</span>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="border-input bg-card file:bg-muted rounded-md border p-2 text-sm file:mr-4 file:rounded-md file:border-0 file:px-4 file:py-2 file:text-sm"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className={labelClass}>What it shows</span>
              <select
                className={inputClass}
                value={mediaType}
                onChange={(e) =>
                  setMediaType(e.target.value as typeof mediaType)
                }
              >
                <option value="photo">A photo</option>
                <option value="floor_plan">A floor plan</option>
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className={labelClass}>Where it came from</span>
              <select
                className={inputClass}
                value={sourceKind}
                onChange={(e) =>
                  setSourceKind(e.target.value as typeof sourceKind)
                }
              >
                <option value="own">Our own image</option>
                <option value="developer_supplied">
                  Supplied by the developer
                </option>
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className={labelClass}>Credit</span>
              <input
                className={inputClass}
                value={attribution}
                onChange={(e) => setAttribution(e.target.value)}
                placeholder="e.g. Photo by PropCompare"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className={labelClass}>Caption (optional)</span>
              <input
                className={inputClass}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
              />
            </label>
            {variantNames.length > 0 ? (
              <label className="flex flex-col gap-2">
                <span className={labelClass}>Unit type (optional)</span>
                <select
                  className={inputClass}
                  value={variant}
                  onChange={(e) => setVariant(e.target.value)}
                >
                  <option value="">Whole project</option>
                  {variantNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <div>
            <Button type="submit" disabled={busy}>
              <ImagePlus /> {busy ? "Uploading…" : "Upload image"}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
