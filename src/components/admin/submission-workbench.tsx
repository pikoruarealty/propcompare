"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { SubmissionDetail } from "@/lib/submissions/queue";

const displayValue = (value: unknown): string =>
  typeof value === "string" ? value : JSON.stringify(value);

const parseValue = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

export function SubmissionWorkbench({
  submission,
  permissionLevel,
}: {
  submission: SubmissionDetail;
  permissionLevel: "verifier" | "owner";
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [selectedField, setSelectedField] = useState(
    submission.availableFields[0]?.fieldKey ?? "",
  );
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const editable =
    submission.status === "draft" || submission.status === "changes_requested";
  const inReview = submission.status === "in_review";
  const existingKeys = useMemo(
    () => new Set(submission.fields.map((field) => field.fieldKey)),
    [submission.fields],
  );

  const request = (url: string, options: RequestInit) =>
    startTransition(async () => {
      setError(null);
      const response = await fetch(url, options);
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(payload?.error?.message ?? "The change could not be saved.");
        return;
      }
      router.refresh();
    });

  const saveField = () => {
    if (!selectedField) return;
    request(
      `/api/v1/admin/submissions/${submission.id}/fields/${encodeURIComponent(selectedField)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: parseValue(value) }),
      },
    );
  };

  const transition = (action: string) =>
    request(`/api/v1/admin/submissions/${submission.id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });

  const reviewField = (
    fieldKey: string,
    reviewStatus: "confirmed" | "rejected",
  ) =>
    request(
      `/api/v1/admin/submissions/${submission.id}/fields/${encodeURIComponent(fieldKey)}/review`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewStatus }),
      },
    );

  const reviewMedia = (
    mediaId: string,
    reviewStatus: "confirmed" | "rejected",
    isPublic: boolean,
  ) =>
    request(
      `/api/v1/admin/submissions/${submission.id}/media/${mediaId}/review`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewStatus, isPublic }),
      },
    );

  const publish = () =>
    request(`/api/v1/admin/submissions/${submission.id}/publish`, {
      method: "POST",
    });

  return (
    <div className="space-y-8">
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      {editable ? (
        <section
          className="border-border bg-card rounded-lg border p-5"
          aria-labelledby="edit-field-heading"
        >
          <h2 id="edit-field-heading" className="font-display text-2xl">
            Add or edit a field
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Enter a JSON value for structured fields (for example an array);
            plain text is accepted for text fields. A hand edit clears any OCR
            evidence so it is never shown as support for a changed value.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
            <select
              className="border-input bg-background h-10 rounded-md border px-3 text-sm"
              value={selectedField}
              onChange={(event) => setSelectedField(event.target.value)}
            >
              {submission.availableFields.map((field) => (
                <option key={field.fieldKey} value={field.fieldKey}>
                  {field.label} ({field.dataType})
                  {existingKeys.has(field.fieldKey) ? " — replace" : ""}
                </option>
              ))}
            </select>
            <input
              className="border-input bg-background h-10 rounded-md border px-3 text-sm"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="Value"
              aria-label="Field value"
            />
            <Button
              type="button"
              onClick={saveField}
              disabled={pending || !selectedField}
            >
              Save field
            </Button>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="fields-heading">
        <h2 id="fields-heading" className="font-display mb-4 text-2xl">
          Field reconciliation
        </h2>
        {submission.fields.length === 0 ? (
          <div className="border-border bg-card rounded-lg border p-8 text-center text-muted-foreground text-sm">
            No values have been proposed yet. Missing active fields are
            explicitly Not stated until a value is entered.
          </div>
        ) : (
          <div className="border-border bg-card overflow-x-auto rounded-lg border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-border bg-muted/50 text-muted-foreground border-b text-xs font-semibold tracking-[0.1em] uppercase">
                  <th className="px-5 py-3">Field</th>
                  <th className="px-5 py-3">Value & evidence</th>
                  <th className="px-5 py-3">Review</th>
                </tr>
              </thead>
              <tbody>
                {submission.fields.map((field) => (
                  <tr
                    key={field.fieldKey}
                    className="border-border border-b align-top last:border-b-0"
                  >
                    <td className="px-5 py-4">
                      <p className="font-medium">{field.label}</p>
                      <p className="text-muted-foreground text-xs">
                        {field.fieldKey}
                      </p>
                    </td>
                    <td className="max-w-xl px-5 py-4 break-words">
                      <p>{displayValue(field.value)}</p>
                      {field.confidence !== null ? (
                        <p className="text-muted-foreground mt-1 text-xs">
                          OCR confidence{" "}
                          {Math.round(Number(field.confidence) * 100)}%
                        </p>
                      ) : null}
                      {field.evidence.map((evidence) => (
                        <p
                          key={`${evidence.sourcePage}-${evidence.sourceSnippet}`}
                          className="text-muted-foreground mt-2 text-xs"
                        >
                          Brochure p.{evidence.sourcePage}
                          {evidence.sourceSnippet
                            ? `: ${evidence.sourceSnippet}`
                            : ""}
                        </p>
                      ))}
                    </td>
                    <td className="px-5 py-4">
                      <p className="capitalize">
                        {field.reviewStatus.replace(/_/g, " ")}
                      </p>
                      {inReview ? (
                        <div className="mt-2 flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() =>
                              reviewField(field.fieldKey, "confirmed")
                            }
                            disabled={pending}
                          >
                            Confirm
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              reviewField(field.fieldKey, "rejected")
                            }
                            disabled={pending}
                          >
                            Reject
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="media-heading">
        <h2 id="media-heading" className="font-display mb-4 text-2xl">
          Proposed media
        </h2>
        {submission.media.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No media has been proposed. Image upload is available while the
            draft is editable.
          </p>
        ) : (
          <div className="space-y-3">
            {submission.media.map((media) => (
              <article
                key={media.id}
                className="border-border bg-card rounded-lg border p-4"
              >
                <p className="font-medium">
                  {media.mediaType.replace(/_/g, " ")} ·{" "}
                  {media.sourceKind.replace(/_/g, " ")}
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {media.attribution}
                  {media.unitVariantName ? ` · ${media.unitVariantName}` : ""}
                  {media.caption ? ` · ${media.caption}` : ""}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {media.reviewStatus.replace(/_/g, " ")}
                  {media.isPublic ? " · public if published" : " · private"}
                </p>
                {inReview ? (
                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => reviewMedia(media.id, "confirmed", true)}
                      disabled={pending}
                    >
                      Approve public
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => reviewMedia(media.id, "rejected", false)}
                      disabled={pending}
                    >
                      Reject
                    </Button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section
        className="border-border bg-card rounded-lg border p-5"
        aria-labelledby="workflow-heading"
      >
        <h2 id="workflow-heading" className="font-display text-2xl">
          Review workflow
        </h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {submission.status === "draft" ||
          submission.status === "changes_requested" ? (
            <Button
              type="button"
              onClick={() => transition("submit")}
              disabled={pending || permissionLevel !== "owner"}
            >
              Submit for review
            </Button>
          ) : null}
          {submission.status === "submitted" ? (
            <Button
              type="button"
              onClick={() => transition("start_review")}
              disabled={pending}
            >
              Start review
            </Button>
          ) : null}
          {inReview ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => transition("request_changes")}
                disabled={pending}
              >
                Request changes
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => transition("reject")}
                disabled={pending}
              >
                Reject submission
              </Button>
              <Button
                type="button"
                onClick={() => transition("approve")}
                disabled={pending}
              >
                Approve
              </Button>
            </>
          ) : null}
          {submission.status === "approved" && permissionLevel === "owner" ? (
            <Button type="button" onClick={publish} disabled={pending}>
              Publish to catalog
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
