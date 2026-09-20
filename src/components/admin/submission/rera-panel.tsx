"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import type { ReraComparisonItem } from "@/lib/rera/mapping";
import { writableItems } from "@/lib/rera/mapping";
import type { ReraState } from "@/lib/rera/submission-fetch";
import { cn } from "@/lib/utils";
import { ConfirmAction } from "./confirm-action";
import { inputClass, labelClass } from "./form-classes";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const formatDate = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

/** A comparison value as a person reads it; empty is "—". */
export const displayReraValue = (
  fieldKey: string,
  value: string | number | null,
): string => {
  if (value === null) return "—";
  if (typeof value === "string" && DATE_ONLY.test(value)) {
    return formatDate(value);
  }
  if (fieldKey === "property.rera_construction_progress_percent") {
    return `${Number(value)}%`;
  }
  return String(value);
};

const STATUS: Record<
  ReraComparisonItem["status"],
  { label: string; tone: string }
> = {
  same: { label: "Matches", tone: "border-border border bg-card" },
  differs: {
    label: "Differs",
    tone: "bg-[color-mix(in_oklab,var(--color-terracotta)_14%,var(--color-chalk))] text-primary",
  },
  not_held: { label: "Not entered", tone: "bg-accent text-accent-foreground" },
  rera_silent: {
    label: "RERA silent",
    tone: "border-border text-muted-foreground border",
  },
};

/**
 * The RERA record for a submission. What the regulator states outranks a brochure,
 * so the flow is: fetch it, see it beside what we hold, then choose to use RERA's
 * values. A difference is shown and never blocks anything, and every value stays
 * editable in the fields below. RERA's own figures are shown for checking; no
 * price is ever fetched or shown.
 */
export function ReraPanel({
  rera,
  editable,
  pending,
  onFetch,
  onApply,
}: {
  rera: ReraState;
  editable: boolean;
  pending: boolean;
  /** Resolves to an error message, or null when the fetch worked. */
  onFetch: (registrationNumber: string) => Promise<string | null>;
  /** Resolves to an error message, or null when the values were applied. */
  onApply: (jobId: string) => Promise<string | null>;
}) {
  // What the admin typed, else the number the submission holds (which changes
  // when a field is edited, so it is read rather than copied into state).
  const [typed, setTyped] = React.useState<string | null>(null);
  const number = typed ?? rera.registrationNumber ?? "";
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchRecord = async () => {
    setBusy(true);
    setError(null);
    setError(await onFetch(number));
    setBusy(false);
  };
  const apply = async () => {
    if (!rera.lastFetch) return;
    setBusy(true);
    setError(null);
    setError(await onApply(rera.lastFetch.jobId));
    setBusy(false);
  };

  const record = rera.lastFetch?.record ?? null;
  const writable = writableItems(rera.comparison);
  const disabled = pending || busy;

  return (
    <section
      aria-labelledby="rera-heading"
      data-slot="rera-panel"
      className="flex flex-col gap-5"
    >
      <div>
        <h2 id="rera-heading" className="font-display text-2xl">
          RERA record
        </h2>
        <p className="text-muted-foreground mt-1 max-w-prose text-sm">
          What the regulator states outranks the brochure. Fetch the record,
          check it beside what we hold, then use RERA&rsquo;s values. Anything
          can still be edited below.
        </p>
      </div>

      {editable ? (
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void fetchRecord();
          }}
        >
          <label className="flex flex-1 flex-col gap-1.5">
            <span className={labelClass}>Registration number</span>
            <input
              className={inputClass}
              value={number}
              placeholder="PR/GJ/AHMEDABAD/…"
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => setTyped(event.target.value)}
            />
          </label>
          <Button type="submit" disabled={disabled || number.trim() === ""}>
            {busy ? "Working…" : record ? "Fetch again" : "Fetch from RERA"}
          </Button>
        </form>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="border-destructive/40 text-destructive rounded-md border p-3 text-sm"
        >
          {error}
        </p>
      ) : null}

      {record && rera.lastFetch ? (
        <>
          <dl className="border-border bg-card grid gap-x-8 gap-y-3 rounded-lg border p-5 text-sm sm:grid-cols-2">
            <Fact label="Project" value={record.projectName} />
            <Fact
              label="Promoter"
              value={
                record.promoterName
                  ? `${record.promoterName}${record.promoterType ? ` (${record.promoterType.toLowerCase()})` : ""}`
                  : null
              }
            />
            <Fact
              label="Registered from"
              value={
                record.registeredFrom ? formatDate(record.registeredFrom) : null
              }
            />
            <Fact
              label="Completion date"
              value={
                record.completionDate ? formatDate(record.completionDate) : null
              }
            />
            <Fact
              label="Latest quarterly filing"
              value={
                record.latestQuarter
                  ? `${record.latestQuarter.name}, ${
                      record.latestQuarter.submittedOn
                        ? `filed ${formatDate(record.latestQuarter.submittedOn)}`
                        : "not yet filed"
                    } (due ${formatDate(record.latestQuarter.dueOn)})`
                  : null
              }
            />
            <Fact
              label="Checked"
              value={new Date(rera.lastFetch.fetchedAt).toLocaleString(
                "en-IN",
                {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Asia/Kolkata",
                },
              )}
            />
          </dl>
          {record.gaps.length > 0 ? (
            <p className="text-muted-foreground text-sm">
              RERA did not return: {record.gaps.join(", ")}. What we hold for
              those is left alone.
            </p>
          ) : null}

          <div className="border-border bg-card overflow-x-auto rounded-lg border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className={cn(labelClass, "p-3 font-semibold")}>Field</th>
                  <th className={cn(labelClass, "p-3 font-semibold")}>
                    We hold
                  </th>
                  <th className={cn(labelClass, "p-3 font-semibold")}>
                    RERA says
                  </th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {rera.comparison.map((item) => (
                  <tr key={item.fieldKey} data-status={item.status}>
                    <td className="p-3 font-medium">{item.label}</td>
                    <td className="p-3">
                      {displayReraValue(item.fieldKey, item.currentValue)}
                    </td>
                    <td className="p-3">
                      {displayReraValue(item.fieldKey, item.reraValue)}
                      {item.note ? (
                        <p className="text-muted-foreground mt-1 max-w-xs text-xs">
                          {item.note}
                        </p>
                      ) : null}
                    </td>
                    <td className="p-3 text-right">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-semibold tracking-[0.06em] uppercase",
                          STATUS[item.status].tone,
                        )}
                      >
                        {STATUS[item.status].label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {editable && writable.length > 0 ? (
              <ConfirmAction
                label={`Use RERA values (${writable.length})`}
                title="Use RERA's values?"
                description={`${writable.length} ${writable.length === 1 ? "field takes" : "fields take"} RERA's value, replacing anything entered by hand or read from the brochure. You can still edit each one afterwards, and nothing goes live until the submission is reviewed and published.`}
                confirmLabel="Use RERA values"
                disabled={disabled}
                onConfirm={() => void apply()}
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                {writable.length === 0
                  ? "Everything RERA states matches this submission."
                  : "RERA values can only be applied while the submission is a draft."}
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">
          {editable
            ? "No RERA record fetched yet. Enter the registration number to fetch it."
            : "No RERA record was fetched for this submission."}
        </p>
      )}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className={labelClass}>{label}</dt>
      <dd className="mt-0.5">
        {value ?? (
          <span className="text-muted-foreground italic">Not stated</span>
        )}
      </dd>
    </div>
  );
}
