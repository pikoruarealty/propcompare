"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { BrochureViewer } from "@/components/admin/pdf/brochure-viewer";
import { Button } from "@/components/ui/button";
import type { PageCategory, PageSuggestion } from "@/lib/ocr/page-router";
import { cn } from "@/lib/utils";

/** The categories a page can be read as. "Other" is simply "not selected". */
type ReadAs = Exclude<PageCategory, "other">;

const READ_AS: { value: ReadAs; label: string }[] = [
  { value: "project_details", label: "Project details" },
  { value: "amenities", label: "Amenities" },
  { value: "specifications", label: "Specifications" },
  { value: "floor_plan", label: "Floor plan" },
];

const LABEL: Record<ReadAs, string> = Object.fromEntries(
  READ_AS.map(({ value, label }) => [value, label]),
) as Record<ReadAs, string>;

const LOW_CONFIDENCE = 0.6;

/**
 * The page-review workbench for a brochure draft. Every page is a thumbnail that
 * can be selected or deselected and opened large; a vision-model pass can
 * *suggest* what each page is, pre-selecting the ones worth reading and giving
 * each a type. The suggestions are only a starting point: the admin can change
 * any page's type or selection, and nothing is read by OCR from here.
 *
 * Deliberately shows no cost anywhere — neither before running the suggestion
 * pass nor after (owner rule, DECISIONS.md 2026-09-20). The step that confirms
 * these pages and queues extraction is the next slice of the admin-portal
 * tasklist.
 */
export function PageReview({
  pdfUrl,
  pageCount,
  ocrJobId,
  suggestions,
}: {
  pdfUrl: string;
  pageCount: number;
  ocrJobId: string;
  suggestions: PageSuggestion[] | null;
}) {
  const router = useRouter();
  const byPage = React.useMemo(
    () => new Map((suggestions ?? []).map((s) => [s.page, s])),
    [suggestions],
  );

  const [selected, setSelected] = React.useState<ReadonlySet<number>>(
    () =>
      new Set(
        (suggestions ?? [])
          .filter((s) => s.category !== "other")
          .map((s) => s.page),
      ),
  );
  const [readAs, setReadAs] = React.useState<ReadonlyMap<number, ReadAs>>(
    () =>
      new Map(
        (suggestions ?? [])
          .filter(
            (s): s is PageSuggestion & { category: ReadAs } =>
              s.category !== "other",
          )
          .map((s) => [s.page, s.category]),
      ),
  );
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const toggle = React.useCallback((page: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(page)) next.delete(page);
      else next.add(page);
      return next;
    });
  }, []);

  const setType = (page: number, value: ReadAs) => {
    setReadAs((current) => new Map(current).set(page, value));
    setSelected((current) => new Set(current).add(page));
  };

  const suggest = async () => {
    setRunning(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v1/admin/ocr-jobs/${ocrJobId}/page-suggestions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ replace: suggestions !== null }),
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(
          payload?.error?.message ??
            "Pages could not be categorized just now. Please try again.",
        );
        return;
      }
      router.refresh();
    } catch {
      setError("Pages could not be categorized. Check your connection.");
    } finally {
      setRunning(false);
    }
  };

  const counts = READ_AS.map(({ value, label }) => ({
    label,
    value,
    n: [...selected].filter((page) => readAs.get(page) === value).length,
  }));
  const untyped = [...selected].filter((page) => !readAs.has(page)).length;
  const noFloorPlansFound =
    suggestions !== null &&
    !suggestions.some((s) => s.category === "floor_plan");

  return (
    <div className="flex flex-col gap-6">
      <div className="border-border bg-card flex flex-wrap items-center justify-between gap-4 rounded-lg border p-5">
        <div className="max-w-prose">
          <p className="font-display text-xl">
            {suggestions === null
              ? "Categorize the brochure pages"
              : "Brochure page categories"}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {suggestions === null
              ? "Every page is looked at and given a category. You review and change anything before a single page is read."
              : "Check the categories below and change any page. Pages you leave unselected are ignored."}
          </p>
        </div>
        <Button
          type="button"
          size="lg"
          variant={suggestions === null ? "default" : "outline"}
          className="h-11 px-5"
          onClick={suggest}
          disabled={running}
        >
          <Sparkles aria-hidden="true" />
          {running
            ? "Categorizing pages…"
            : suggestions === null
              ? "Categorize brochure pages"
              : "Categorize again"}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <div className="text-muted-foreground text-sm" aria-live="polite">
        <p>
          <span className="data-tabular text-foreground">{selected.size}</span>{" "}
          of <span className="data-tabular">{pageCount}</span> pages selected.
          Click a page to view it larger; use the checkbox to select it.
        </p>
        {selected.size > 0 ? (
          <p className="mt-1">
            {counts
              .filter((c) => c.n > 0)
              .map((c) => `${c.n} ${c.label.toLowerCase()}`)
              .join(" · ")}
            {untyped > 0
              ? `${counts.some((c) => c.n > 0) ? " · " : ""}${untyped} still need a type`
              : ""}
          </p>
        ) : null}
        {noFloorPlansFound ? (
          <p className="mt-1">
            No floor plans were found in this brochure, so the floor-plan step
            will be skipped. If you can see one, select it and mark it as a
            floor plan.
          </p>
        ) : null}
      </div>

      <BrochureViewer
        pdfUrl={pdfUrl}
        pageCount={pageCount}
        selected={selected}
        onToggle={toggle}
        renderMeta={(page) => (
          <PageMeta
            page={page}
            suggestion={byPage.get(page)}
            included={selected.has(page)}
            value={readAs.get(page)}
            onChange={(value) => setType(page, value)}
          />
        )}
        renderLightboxFooter={(page) => (
          <>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.has(page)}
                onChange={() => toggle(page)}
                className="size-4 accent-[var(--color-terracotta)]"
              />
              Select page {page}
            </label>
            <PageMeta
              page={page}
              suggestion={byPage.get(page)}
              included={selected.has(page)}
              value={readAs.get(page)}
              onChange={(value) => setType(page, value)}
              inline
            />
          </>
        )}
      />
    </div>
  );
}

function PageMeta({
  page,
  suggestion,
  included,
  value,
  onChange,
  inline = false,
}: {
  page: number;
  suggestion: PageSuggestion | undefined;
  included: boolean;
  value: ReadAs | undefined;
  onChange: (value: ReadAs) => void;
  inline?: boolean;
}) {
  const unclassified = suggestion !== undefined && suggestion.confidence === 0;
  const unsure =
    suggestion !== undefined &&
    suggestion.confidence > 0 &&
    suggestion.confidence < LOW_CONFIDENCE;

  return (
    <div className={cn("flex flex-col gap-2", inline && "items-end")}>
      <div className="flex flex-col gap-1">
        <label
          htmlFor={`type-${inline ? "large-" : ""}${page}`}
          className="text-muted-foreground text-xs font-semibold tracking-[0.1em] uppercase"
        >
          Read as
        </label>
        <select
          id={`type-${inline ? "large-" : ""}${page}`}
          value={included ? (value ?? "") : ""}
          disabled={!included}
          onChange={(event) => onChange(event.target.value as ReadAs)}
          className="border-input bg-card focus:border-ring h-9 rounded-md border px-2 text-sm outline-none disabled:opacity-50"
        >
          <option value="" disabled>
            {included ? "Choose a type" : "Not read"}
          </option>
          {READ_AS.map(({ value: v, label }) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {suggestion?.caption ? (
        <p className="text-muted-foreground text-xs">{suggestion.caption}</p>
      ) : null}
      {unclassified ? (
        <p className="text-primary text-xs">Not classified — please check</p>
      ) : unsure ? (
        <p className="text-primary text-xs">Low confidence — please check</p>
      ) : null}
      {suggestion && suggestion.imagery.length > 0 ? (
        <ul className="flex flex-wrap gap-1" aria-label="What the page shows">
          {suggestion.imagery.map((tag) => (
            <li
              key={tag}
              className="border-border bg-muted text-muted-foreground rounded-full border px-2 py-0.5 text-xs"
            >
              {tag.replace(/_/g, " ")}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export { LABEL as PAGE_TYPE_LABEL };
