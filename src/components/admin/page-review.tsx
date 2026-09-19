"use client";

import * as React from "react";
import { Dialog } from "radix-ui";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { BrochureViewer } from "@/components/admin/pdf/brochure-viewer";
import { Button } from "@/components/ui/button";
import type { PageCategory, PageSuggestion } from "@/lib/ocr/page-router";
import { cn } from "@/lib/utils";
import { offersPageImage, PageImageAction } from "./page-image-action";

type ReadAs = Exclude<PageCategory, "other">;
type ConfirmedCategory = ReadAs | "ignore";

export interface ConfirmedPageChoice {
  pageNumber: number;
  category: ConfirmedCategory;
}

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

const readError = async (response: Response, fallback: string) => {
  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return payload?.error?.message ?? fallback;
};

/**
 * The client sends one page-level choice; the server builds the only accepted
 * v2 manifest. Queueing is a second confirmation and makes no provider call.
 */
export function PageReview({
  pdfUrl,
  pageCount,
  ocrJobId,
  ocrJobStatus,
  suggestions,
  confirmedChoices,
  submissionId,
}: {
  pdfUrl: string;
  pageCount: number;
  ocrJobId: string;
  ocrJobStatus: string;
  suggestions: PageSuggestion[] | null;
  confirmedChoices: ConfirmedPageChoice[] | null;
  /** When given, pages can be used as image candidates for this submission. */
  submissionId?: string;
}) {
  const router = useRouter();
  const editable = ocrJobStatus === "draft";
  const byPage = React.useMemo(
    () =>
      new Map(
        (suggestions ?? []).map((suggestion) => [suggestion.page, suggestion]),
      ),
    [suggestions],
  );
  const [selected, setSelected] = React.useState<ReadonlySet<number>>(
    () =>
      new Set(
        confirmedChoices !== null
          ? confirmedChoices
              .filter((choice) => choice.category !== "ignore")
              .map((choice) => choice.pageNumber)
          : (suggestions ?? [])
              .filter((suggestion) => suggestion.category !== "other")
              .map((suggestion) => suggestion.page),
      ),
  );
  const [readAs, setReadAs] = React.useState<ReadonlyMap<number, ReadAs>>(
    () =>
      new Map(
        confirmedChoices !== null
          ? confirmedChoices
              .filter(
                (
                  choice,
                ): choice is ConfirmedPageChoice & { category: ReadAs } =>
                  choice.category !== "ignore",
              )
              .map((choice) => [choice.pageNumber, choice.category])
          : (suggestions ?? [])
              .filter(
                (
                  suggestion,
                ): suggestion is PageSuggestion & { category: ReadAs } =>
                  suggestion.category !== "other",
              )
              .map((suggestion) => [suggestion.page, suggestion.category]),
      ),
  );
  const [routingConfirmed, setRoutingConfirmed] = React.useState(
    confirmedChoices !== null,
  );
  const [running, setRunning] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [queueOpen, setQueueOpen] = React.useState(false);
  const [queueing, setQueueing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const routeChanged = React.useCallback(() => {
    if (routingConfirmed) setRoutingConfirmed(false);
  }, [routingConfirmed]);
  const toggle = React.useCallback(
    (page: number) => {
      if (!editable) return;
      routeChanged();
      setSelected((current) => {
        const next = new Set(current);
        if (next.has(page)) next.delete(page);
        else next.add(page);
        return next;
      });
    },
    [editable, routeChanged],
  );
  const setType = (page: number, value: ReadAs) => {
    if (!editable) return;
    routeChanged();
    setReadAs((current) => new Map(current).set(page, value));
    setSelected((current) => new Set(current).add(page));
  };
  const pageChoices = () =>
    Array.from({ length: pageCount }, (_, index) => {
      const pageNumber = index + 1;
      return {
        pageNumber,
        category: selected.has(pageNumber) ? readAs.get(pageNumber) : "ignore",
      };
    });

  const suggest = async () => {
    setRunning(true);
    setError(null);
    try {
      const response = await fetch(
        "/api/v1/admin/ocr-jobs/" + ocrJobId + "/page-suggestions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ replace: suggestions !== null }),
        },
      );
      if (!response.ok) {
        setError(
          await readError(
            response,
            "Pages could not be categorized just now. Please try again.",
          ),
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
  const saveRouting = async () => {
    const incomplete = pageChoices().find(
      (choice) => choice.category === undefined,
    );
    if (incomplete) {
      setError(
        "Page " +
          incomplete.pageNumber +
          " needs a type or must be deselected.",
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        "/api/v1/admin/ocr-jobs/" + ocrJobId + "/routing-manifest",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pages: pageChoices() }),
        },
      );
      if (!response.ok) {
        setError(
          await readError(
            response,
            "Page routing could not be confirmed. Please try again.",
          ),
        );
        return;
      }
      setRoutingConfirmed(true);
    } catch {
      setError("Page routing could not be confirmed. Check your connection.");
    } finally {
      setSaving(false);
    }
  };
  const queue = async () => {
    setQueueing(true);
    setError(null);
    try {
      const response = await fetch(
        "/api/v1/admin/ocr-jobs/" + ocrJobId + "/queue",
        { method: "POST" },
      );
      if (!response.ok) {
        setError(
          await readError(
            response,
            "Extraction could not be queued. Refresh and try again.",
          ),
        );
        setQueueOpen(false);
        return;
      }
      setQueueOpen(false);
      router.refresh();
    } catch {
      setError("Extraction could not be queued. Check your connection.");
      setQueueOpen(false);
    } finally {
      setQueueing(false);
    }
  };

  const counts = READ_AS.map(({ value, label }) => ({
    label,
    n: [...selected].filter((page) => readAs.get(page) === value).length,
  }));
  const untyped = [...selected].filter((page) => !readAs.has(page)).length;
  const noFloorPlansFound =
    suggestions !== null &&
    !suggestions.some((suggestion) => suggestion.category === "floor_plan");

  return (
    <div className="flex flex-col gap-6">
      <section className="border-border bg-card flex flex-wrap items-center justify-between gap-4 rounded-lg border p-5">
        <div className="max-w-prose">
          <p className="font-display text-xl">
            {suggestions === null
              ? "Categorize the brochure pages"
              : "Brochure page categories"}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {editable
              ? "Check every category below. Pages you leave unselected are explicitly ignored."
              : "Extraction is queued. The confirmed page routing is locked, but every page remains viewable."}
          </p>
        </div>
        {editable ? (
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
        ) : null}
      </section>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      {routingConfirmed && editable ? (
        <p
          role="status"
          className="border-border bg-muted rounded-lg border px-4 py-3 text-sm"
        >
          Page routing is confirmed. Queue Claude extraction when you are ready.
        </p>
      ) : null}

      <div className="text-muted-foreground text-sm" aria-live="polite">
        <p>
          <span className="data-tabular text-foreground">{selected.size}</span>{" "}
          of <span className="data-tabular">{pageCount}</span> pages selected.
        </p>
        {selected.size > 0 ? (
          <p className="mt-1">
            {counts
              .filter((count) => count.n > 0)
              .map((count) => String(count.n) + " " + count.label.toLowerCase())
              .join(" · ")}
            {untyped > 0
              ? (counts.some((count) => count.n > 0) ? " · " : "") +
                String(untyped) +
                " still need a type"
              : ""}
          </p>
        ) : null}
        {noFloorPlansFound ? (
          <p className="mt-1">
            No floor plans were found, so the floor-plan step will be skipped.
            If you can see one, select it and mark it as a floor plan.
          </p>
        ) : null}
      </div>

      {editable ? (
        <section className="border-border bg-card flex flex-wrap items-center justify-between gap-4 rounded-lg border p-5">
          <div className="max-w-prose">
            <p className="font-display text-lg">1. Confirm page routing</p>
            <p className="text-muted-foreground mt-1 text-sm">
              This saves the final page choices. It does not start extraction.
            </p>
          </div>
          <Button
            type="button"
            size="lg"
            onClick={saveRouting}
            disabled={saving || untyped > 0}
          >
            {saving
              ? "Confirming pages…"
              : routingConfirmed
                ? "Save routing changes"
                : "Confirm page routing"}
          </Button>
        </section>
      ) : null}

      {editable && routingConfirmed ? (
        <section className="border-border bg-card flex flex-wrap items-center justify-between gap-4 rounded-lg border p-5">
          <div className="max-w-prose">
            <p className="font-display text-lg">2. Queue Claude extraction</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Claude will read only the confirmed pages. You can still change
              routing before queueing.
            </p>
          </div>
          <Dialog.Root open={queueOpen} onOpenChange={setQueueOpen}>
            <Dialog.Trigger asChild>
              <Button type="button" size="lg">
                Queue extraction
              </Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-[color-mix(in_oklab,var(--color-ink)_55%,transparent)]" />
              <Dialog.Content className="bg-background fixed top-1/2 left-1/2 z-50 w-[min(calc(100vw-2rem),30rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border p-6 shadow-lg">
                <Dialog.Title className="font-display text-2xl">
                  Queue Claude extraction?
                </Dialog.Title>
                <Dialog.Description className="text-muted-foreground mt-2 text-sm">
                  Claude will read the pages you confirmed and create a draft
                  for review. Page routing will then be locked.
                </Dialog.Description>
                <div className="mt-6 flex justify-end gap-3">
                  <Dialog.Close asChild>
                    <Button type="button" variant="outline" disabled={queueing}>
                      Go back
                    </Button>
                  </Dialog.Close>
                  <Button type="button" onClick={queue} disabled={queueing}>
                    {queueing ? "Queueing…" : "Queue extraction"}
                  </Button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </section>
      ) : null}

      <BrochureViewer
        pdfUrl={pdfUrl}
        pageCount={pageCount}
        selected={selected}
        onToggle={toggle}
        selectionDisabled={!editable}
        renderMeta={(page) => (
          <PageMeta
            page={page}
            suggestion={byPage.get(page)}
            included={selected.has(page)}
            value={readAs.get(page)}
            locked={!editable}
            submissionId={submissionId}
            onChange={(value) => setType(page, value)}
          />
        )}
        renderLightboxFooter={(page) =>
          editable ? (
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
                submissionId={submissionId}
                onChange={(value) => setType(page, value)}
                inline
              />
            </>
          ) : null
        }
      />
    </div>
  );
}

function PageMeta({
  page,
  suggestion,
  included,
  value,
  locked = false,
  submissionId,
  onChange,
  inline = false,
}: {
  page: number;
  suggestion: PageSuggestion | undefined;
  included: boolean;
  value: ReadAs | undefined;
  locked?: boolean;
  submissionId?: string;
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
          htmlFor={"type-" + (inline ? "large-" : "") + String(page)}
          className="text-muted-foreground text-xs font-semibold tracking-[0.1em] uppercase"
        >
          Read as
        </label>
        <select
          id={"type-" + (inline ? "large-" : "") + String(page)}
          value={included ? (value ?? "") : ""}
          disabled={!included || locked}
          onChange={(event) => onChange(event.target.value as ReadAs)}
          className="border-input bg-card focus:border-ring h-9 rounded-md border px-2 text-sm outline-none disabled:opacity-50"
        >
          <option value="" disabled>
            {included ? "Choose a type" : "Not read"}
          </option>
          {READ_AS.map(({ value: optionValue, label }) => (
            <option key={optionValue} value={optionValue}>
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
      ) : null}
      {unsure ? (
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
      {submissionId && offersPageImage(suggestion) ? (
        <PageImageAction
          submissionId={submissionId}
          page={page}
          suggestion={suggestion}
          suggestedType={value}
        />
      ) : null}
    </div>
  );
}

export { LABEL as PAGE_TYPE_LABEL };
