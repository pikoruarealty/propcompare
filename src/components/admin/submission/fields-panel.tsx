"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  groupFields,
  REVIEW_STATUS_LABEL,
} from "@/lib/submissions/field-display";
import type { ReraComparisonItem } from "@/lib/rera/mapping";
import { LIVE_FIELD_KEYS } from "@/lib/submissions/live-field-keys";
import type { SubmissionDetail } from "@/lib/submissions/queue";
import { cn } from "@/lib/utils";
import { ConfirmAction } from "./confirm-action";
import { FieldEditor } from "./field-editor";
import { FieldValue } from "./field-value";
import { displayReraValue } from "./rera-panel";

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
 * Every active contract field, grouped the way a listing reads. A field with a
 * candidate shows its value, confidence, the brochure pages it came from and its
 * review state; a field with none says "Not stated". While the draft is editable
 * each row can be edited or filled in with a typed input; while it is in review
 * each candidate can be confirmed or rejected.
 */
export function FieldsPanel({
  submission,
  reraDifferences = {},
  editable,
  inReview,
  pending,
  onSave,
  onReview,
  onConfirmAll,
}: {
  submission: SubmissionDetail;
  /** Fields whose held value differs from RERA's, keyed by field key. */
  reraDifferences?: Record<string, ReraComparisonItem>;
  editable: boolean;
  inReview: boolean;
  pending: boolean;
  /** Resolves to an error message, or null when saved. */
  onSave: (fieldKey: string, value: unknown) => Promise<string | null>;
  onReview: (fieldKey: string, status: "confirmed" | "rejected") => void;
  /** Confirms every value still waiting for review. */
  onConfirmAll?: () => void;
}) {
  const [editing, setEditing] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const groups = groupFields(submission.availableFields, submission.fields);

  const save = async (fieldKey: string, value: unknown) => {
    const message = await onSave(fieldKey, value);
    setError(message);
    if (!message) setEditing(null);
  };

  const waiting = submission.fields.filter(
    (field) => field.reviewStatus === "needs_review",
  ).length;

  return (
    <div className="flex flex-col gap-8">
      {inReview && onConfirmAll && waiting > 0 ? (
        <div className="border-border bg-card flex flex-wrap items-center justify-between gap-4 rounded-lg border p-5">
          <p className="text-muted-foreground max-w-prose text-sm">
            {waiting} {waiting === 1 ? "value is" : "values are"} still waiting
            for your check. Confirm them one by one below, or all at once when
            you have checked them against the brochure.
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
            {rows.map(({ field, candidate }) => (
              <li
                key={field.fieldKey}
                className="grid gap-3 p-5 md:grid-cols-[14rem_1fr_auto]"
              >
                <div>
                  <p className="font-medium">{field.label}</p>
                </div>

                <div className="min-w-0">
                  {editing === field.fieldKey ? (
                    <FieldEditor
                      field={field}
                      initial={candidate?.value}
                      lookups={submission.lookups}
                      pending={pending}
                      error={error}
                      onSave={(value) => save(field.fieldKey, value)}
                      onCancel={() => {
                        setEditing(null);
                        setError(null);
                      }}
                    />
                  ) : candidate ? (
                    <>
                      <FieldValue
                        dataType={field.dataType}
                        value={candidate.value}
                        lookups={submission.lookups}
                      />
                      {submission.propertyId &&
                      field.fieldKey !== "property.legal_entity_id" &&
                      submission.live[field.fieldKey] !== undefined &&
                      JSON.stringify(submission.live[field.fieldKey]) !==
                        JSON.stringify(candidate.value) ? (
                        <p
                          data-slot="live-value"
                          className="text-muted-foreground mt-2 text-xs"
                        >
                          Currently published:{" "}
                          {displayReraValue(
                            field.fieldKey,
                            typeof submission.live[field.fieldKey] ===
                              "number" ||
                              typeof submission.live[field.fieldKey] ===
                                "string"
                              ? (submission.live[field.fieldKey] as
                                  string | number)
                              : null,
                          )}
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
                      {candidate.confidence !== null ? (
                        <p className="text-muted-foreground mt-2 text-xs">
                          Read with{" "}
                          {Math.round(Number(candidate.confidence) * 100)}%
                          confidence
                        </p>
                      ) : null}
                      {candidate.evidence.map((e) => (
                        <p
                          key={`${e.sourcePage}-${e.sourceSnippet}`}
                          className="text-muted-foreground mt-1 text-xs"
                        >
                          Brochure page {e.sourcePage}
                          {e.sourceSnippet ? ` — “${e.sourceSnippet}”` : ""}
                        </p>
                      ))}
                    </>
                  ) : submission.propertyId &&
                    submission.live[field.fieldKey] !== undefined ? (
                    <>
                      <FieldValue
                        dataType={field.dataType}
                        value={submission.live[field.fieldKey]}
                        lookups={submission.lookups}
                      />
                      <p
                        data-slot="live-value"
                        className="text-muted-foreground mt-2 text-xs"
                      >
                        Currently published. Unchanged unless you edit it.
                      </p>
                    </>
                  ) : submission.propertyId &&
                    !LIVE_FIELD_KEYS.has(field.fieldKey) ? (
                    <span
                      data-slot="live-value"
                      className="text-muted-foreground italic"
                    >
                      Unchanged. Keeps what is published.
                    </span>
                  ) : (
                    <span className="text-muted-foreground italic">
                      Not stated
                    </span>
                  )}
                </div>

                <div className="flex flex-col items-start gap-2 md:items-end">
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
                  {editing !== field.fieldKey ? (
                    <div className="flex flex-wrap gap-2">
                      {editable ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() => {
                            setError(null);
                            setEditing(field.fieldKey);
                          }}
                        >
                          {candidate ||
                          submission.live[field.fieldKey] !== undefined
                            ? "Edit"
                            : "Add"}
                        </Button>
                      ) : null}
                      {inReview && candidate ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            disabled={
                              pending || candidate.reviewStatus === "confirmed"
                            }
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
                            disabled={
                              pending || candidate.reviewStatus === "rejected"
                            }
                            onClick={() => onReview(field.fieldKey, "rejected")}
                          >
                            Reject
                          </Button>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
