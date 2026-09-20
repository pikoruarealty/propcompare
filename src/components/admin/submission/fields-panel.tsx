"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  groupFields,
  REVIEW_STATUS_LABEL,
} from "@/lib/submissions/field-display";
import type { ReraComparisonItem } from "@/lib/rera/mapping";
import type { SubmissionDetail } from "@/lib/submissions/queue";
import { cn } from "@/lib/utils";
import { isEditOnlyField } from "@/lib/submissions/edit-only-fields";
import { ConfirmAction } from "./confirm-action";
import { InlineField } from "./inline-field";
import { FieldValue } from "./field-value";
import { displayReraValue } from "./rera-panel";

/** What an edit of a live property can and cannot do with a whole-set field. */
const EDIT_NOTES: Record<string, string> = {
  unit_variants:
    "Starts from the published unit types. Change a type's details, areas and room dimensions in its tabs. A published type keeps its name; removing one hides it from buyers when this is published, and adding it again with the same name brings it back.",
  "property.amenities":
    "Starts from the published amenities. Untick one to take it off the listing when this is published (it then reads as not stated).",
};

/** The edit-only field that carries what an edit takes off each whole-set field. */
const REMOVAL_FIELD: Record<string, string> = {
  "property.amenities": "property.amenities_removed",
  unit_variants: "unit_variants_removed",
};

const STATUS_TONE: Record<string, string> = {
  needs_review: "bg-accent text-accent-foreground",
  auto_accepted: "bg-accent text-accent-foreground",
  edited:
    "bg-[color-mix(in_oklab,var(--color-terracotta)_14%,var(--color-chalk))] text-primary",
  confirmed: "border-border border bg-card text-foreground",
  rejected:
    "bg-[color-mix(in_oklab,var(--destructive)_12%,var(--color-chalk))] text-destructive",
};

/**
 * The prompt to confirm every value still waiting for review, once they have been
 * checked against the brochure. Shown above the fields (or above their tabs).
 */
export function ConfirmAllBar({
  waiting,
  pending,
  onConfirmAll,
}: {
  waiting: number;
  pending: boolean;
  onConfirmAll: () => void;
}) {
  if (waiting === 0) return null;
  return (
    <div
      data-slot="confirm-all"
      className="border-border bg-card flex flex-wrap items-center justify-between gap-4 rounded-lg border p-5"
    >
      <p className="text-muted-foreground max-w-prose text-sm">
        {waiting} {waiting === 1 ? "value is" : "values are"} still waiting for
        your check. Confirm them one by one in the tabs below, or all at once
        when you have checked them against the brochure.
      </p>
      <ConfirmAction
        label={`Confirm all ${waiting} remaining`}
        title="Confirm every remaining value?"
        description="Use this once you have checked the values against the brochure pages shown beside them. Values you edited or rejected stay as they are."
        confirmLabel="Confirm all"
        variant="outline"
        disabled={pending}
        onConfirm={onConfirmAll}
      />
    </div>
  );
}

/**
 * Every active contract field, grouped the way a listing reads. While the
 * submission can still be worked on, each field is simply an input: type into it
 * and it saves when you leave it. There is no Edit button to press first. Each row
 * keeps its name on the left and its status on the right, on one line, so a tag
 * never stacks on a button; a value read from a brochure that nobody has checked
 * yet shows Confirm and Reject beside its status.
 *
 * Once a submission is published or rejected the fields are read-only.
 */
export function FieldsPanel({
  submission,
  reraDifferences = {},
  only,
  editable,
  reviewable,
  pending,
  onSave,
  onReview,
  onConfirmAll,
}: {
  submission: SubmissionDetail;
  /** Show just this group of fields (a tab of the edit screen); all when absent. */
  only?: string;
  /** Fields whose held value differs from RERA's, keyed by field key. */
  reraDifferences?: Record<string, ReraComparisonItem>;
  /** The submission can still be worked on (anything before published or rejected). */
  editable: boolean;
  /** Values can be confirmed or rejected (the same stages). */
  reviewable: boolean;
  pending: boolean;
  /** Resolves to an error message, or null when saved. */
  onSave: (fieldKey: string, value: unknown) => Promise<string | null>;
  onReview: (fieldKey: string, status: "confirmed" | "rejected") => void;
  /** Confirms every value still waiting for review. */
  onConfirmAll?: () => void;
}) {
  const groups = groupFields(submission.availableFields, submission.fields)
    .map(({ group, rows }) => ({
      group,
      // Removal lists and listing status are shown as notes and buttons, not rows.
      rows: rows.filter(({ field }) => !isEditOnlyField(field.fieldKey)),
    }))
    .filter(
      ({ group, rows }) =>
        rows.length > 0 && (only === undefined || group.key === only),
    );

  /** Unit types already published, whose names are fixed in an edit. */
  const publishedVariantNames = submission.propertyId
    ? (Array.isArray(submission.live["unit_variants"])
        ? (submission.live["unit_variants"] as { variantName?: unknown }[])
        : []
      ).flatMap((variant) =>
        typeof variant.variantName === "string" ? [variant.variantName] : [],
      )
    : [];

  /** Saves one field; resolves to an error message, or null. */
  const save = async (
    fieldKey: string,
    value: unknown,
  ): Promise<string | null> => {
    const message = await onSave(fieldKey, value);
    if (message) return message;
    // Taking something off a live listing is its own recorded change: what was
    // published and is no longer in the list is sent as a removal, so unticking
    // an amenity or removing a unit type really applies when this is published.
    if (submission.propertyId) {
      const published = submission.live[fieldKey];
      if (
        fieldKey === "property.amenities" &&
        Array.isArray(published) &&
        Array.isArray(value)
      ) {
        return onSave(
          "property.amenities_removed",
          published.filter((key) => !value.includes(key)),
        );
      }
      if (
        fieldKey === "unit_variants" &&
        Array.isArray(published) &&
        Array.isArray(value)
      ) {
        const kept = new Set(
          (value as { variantName?: string }[]).map((variant) =>
            String(variant.variantName ?? "").toLowerCase(),
          ),
        );
        return onSave(
          "unit_variants_removed",
          (published as { variantName: string }[])
            .map((variant) => variant.variantName)
            .filter((name) => !kept.has(name.toLowerCase())),
        );
      }
    }
    return null;
  };

  const waiting = submission.fields.filter(
    (field) => field.reviewStatus === "needs_review",
  ).length;

  return (
    <div className="flex flex-col gap-8">
      {reviewable && onConfirmAll && only === undefined ? (
        <ConfirmAllBar
          waiting={waiting}
          pending={pending}
          onConfirmAll={onConfirmAll}
        />
      ) : null}
      {groups.map(({ group, rows }) => (
        <section key={group.key} aria-labelledby={`group-${group.key}`}>
          <h2 id={`group-${group.key}`} className="font-display text-2xl">
            {group.title}
          </h2>
          <p className="text-muted-foreground mt-1 mb-4 text-sm">
            {group.description}
          </p>
          <ul className="border-border bg-card divide-border divide-y rounded-lg border">
            {rows.map(({ field, candidate }) => {
              /** The published value, when this is an edit of a live property. */
              const live = submission.propertyId
                ? submission.live[field.fieldKey]
                : undefined;
              const changed =
                candidate &&
                live !== undefined &&
                JSON.stringify(live) !== JSON.stringify(candidate.value);
              const waitingForCheck =
                reviewable && candidate?.reviewStatus === "needs_review";
              const removalKey = REMOVAL_FIELD[field.fieldKey];
              const removed = removalKey
                ? submission.fields.find((f) => f.fieldKey === removalKey)
                    ?.value
                : undefined;

              return (
                <li key={field.fieldKey} data-slot="field-row" className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <label
                      htmlFor={`field-${field.fieldKey}`}
                      className="font-medium"
                    >
                      {field.label}
                    </label>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {!candidate && live !== undefined ? (
                        <span
                          data-slot="unchanged-mark"
                          className="border-border text-muted-foreground rounded-full border px-2.5 py-1 text-xs font-semibold tracking-[0.06em] uppercase"
                        >
                          Unchanged
                        </span>
                      ) : null}
                      {changed ? (
                        <span
                          data-slot="changed-mark"
                          className="text-primary rounded-full bg-[color-mix(in_oklab,var(--color-terracotta)_10%,var(--color-chalk))] px-2.5 py-1 text-xs font-semibold tracking-[0.06em] uppercase"
                        >
                          Changed
                        </span>
                      ) : null}
                      {candidate ? (
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-1 text-xs font-semibold tracking-[0.06em] uppercase",
                            STATUS_TONE[candidate.reviewStatus] ??
                              STATUS_TONE.needs_review,
                          )}
                        >
                          {REVIEW_STATUS_LABEL[candidate.reviewStatus] ??
                            candidate.reviewStatus}
                        </span>
                      ) : null}
                      {waitingForCheck ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            disabled={pending}
                            onClick={() =>
                              onReview(field.fieldKey, "confirmed")
                            }
                          >
                            Confirm
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={pending}
                            onClick={() => onReview(field.fieldKey, "rejected")}
                          >
                            Reject
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 min-w-0">
                    {editable ? (
                      <InlineField
                        // A value that arrives from elsewhere (a RERA fetch, a
                        // review) starts the input afresh.
                        key={JSON.stringify(candidate?.value ?? live ?? null)}
                        field={field}
                        initial={candidate?.value ?? live}
                        lookups={submission.lookups}
                        lockedVariantNames={publishedVariantNames}
                        disabled={pending}
                        onSave={save}
                      />
                    ) : candidate ? (
                      <FieldValue
                        dataType={field.dataType}
                        value={candidate.value}
                        lookups={submission.lookups}
                      />
                    ) : live !== undefined ? (
                      <FieldValue
                        dataType={field.dataType}
                        value={live}
                        lookups={submission.lookups}
                      />
                    ) : (
                      <span className="text-muted-foreground italic">
                        Not stated
                      </span>
                    )}

                    {changed &&
                    (typeof live === "string" || typeof live === "number") &&
                    field.fieldKey !== "property.legal_entity_id" ? (
                      <p
                        data-slot="live-value"
                        className="text-muted-foreground mt-2 text-xs"
                      >
                        Currently published:{" "}
                        {displayReraValue(field.fieldKey, live)}
                      </p>
                    ) : null}
                    {Array.isArray(removed) && removed.length > 0 ? (
                      <p
                        data-slot="removal-note"
                        className="text-destructive mt-2 text-xs font-medium"
                      >
                        Removing when published:{" "}
                        {(removed as string[])
                          .map(
                            (key) =>
                              submission.lookups.amenities.find(
                                (amenity) => amenity.key === key,
                              )?.label ?? key,
                          )
                          .join(", ")}
                      </p>
                    ) : null}
                    {reraDifferences[field.fieldKey] ? (
                      <p
                        data-slot="rera-difference"
                        className="text-primary mt-2 text-xs font-medium"
                      >
                        Differs from RERA. RERA says{" "}
                        {displayReraValue(
                          field.fieldKey,
                          reraDifferences[field.fieldKey].reraValue,
                        )}
                        .
                      </p>
                    ) : null}
                    {candidate && candidate.confidence !== null ? (
                      <p className="text-muted-foreground mt-2 text-xs">
                        Read with{" "}
                        {Math.round(Number(candidate.confidence) * 100)}%
                        confidence
                      </p>
                    ) : null}
                    {candidate?.evidence.map((e) => (
                      <p
                        key={`${e.sourcePage}-${e.sourceSnippet}`}
                        className="text-muted-foreground mt-1 text-xs"
                      >
                        Brochure page {e.sourcePage}
                        {e.sourceSnippet ? ` — “${e.sourceSnippet}”` : ""}
                      </p>
                    ))}
                    {editable &&
                    submission.propertyId &&
                    EDIT_NOTES[field.fieldKey] ? (
                      <p
                        data-slot="edit-note"
                        className="text-muted-foreground mt-3 text-xs"
                      >
                        {EDIT_NOTES[field.fieldKey]}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
