"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { isExtractionActive } from "@/lib/ingestion/extraction-status";
import { ConfirmAction } from "./submission/confirm-action";

const POLL_MS = 5_000;

/**
 * Where a brochure extraction stands, with no cost shown. While it is waiting or
 * running it asks a tiny status endpoint every few seconds (and not at all while
 * the tab is hidden) and refreshes the page only when the status has changed, so
 * watching a run costs almost nothing and never reloads the brochure. A failed run
 * offers "Try again" (a second paid run, so it asks first) or "Edit pages" (back
 * to the page choices).
 */
export function ExtractionStatus({
  ocrJobId,
  status,
  failureMessage,
  fieldsHref,
}: {
  ocrJobId: string;
  status: string;
  failureMessage: string | null;
  /** Shown when finished, on screens that are not already the fields. */
  fieldsHref?: string;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!isExtractionActive(status)) return;
    let stopped = false;
    const check = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch(`/api/v1/admin/ocr-jobs/${ocrJobId}`, {
          cache: "no-store",
        });
        if (!response.ok || stopped) return;
        const latest = (await response.json()) as { status?: string };
        if (latest.status && latest.status !== status) {
          stopped = true;
          router.refresh();
        }
      } catch {
        // A missed check is harmless: the next one tries again.
      }
    };
    const timer = setInterval(check, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [status, ocrJobId, router]);

  const reopen = async (mode: "requeue" | "edit_pages") => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/admin/ocr-jobs/${ocrJobId}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(
          payload?.error?.message ??
            "That could not be done. Refresh and try again.",
        );
        return;
      }
      router.refresh();
    } catch {
      setError("That could not be done. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  if (status === "draft" || status === "cancelled") return null;

  const shell =
    "border-border bg-card flex flex-wrap items-center justify-between gap-4 rounded-lg border p-5";

  if (status === "queued" || status === "processing") {
    return (
      <section
        className="border-primary/40 bg-tone-terracotta flex flex-col gap-4 rounded-lg border p-5"
        role="status"
        aria-live="polite"
        data-slot="extraction-busy"
      >
        <div className="flex items-start gap-4">
          <span
            aria-hidden="true"
            className="border-primary/25 border-t-primary mt-1 size-7 shrink-0 animate-spin rounded-full border-[3px] motion-reduce:animate-none"
          />
          <div className="max-w-prose">
            <p className="font-display text-xl">
              {status === "queued"
                ? "Getting ready to read the pages"
                : "Reading the confirmed pages"}
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              {status === "queued"
                ? "The brochure is next in line. This page updates by itself."
                : "This usually takes a few minutes for a full brochure. You can leave this page; the result will be here when you come back."}
            </p>
          </div>
        </div>
        <div
          aria-hidden="true"
          className="bg-border relative h-1.5 w-full overflow-hidden rounded-full"
        >
          <span className="bg-primary absolute inset-y-0 w-1/3 animate-[extraction-slide_1.6s_ease-in-out_infinite] rounded-full motion-reduce:animate-none" />
        </div>
      </section>
    );
  }

  if (status === "failed") {
    return (
      <section className={shell}>
        <div className="max-w-prose">
          <p className="font-display text-xl">Extraction did not finish</p>
          <p className="text-muted-foreground mt-1 text-sm">{failureMessage}</p>
          {error ? (
            <p role="alert" className="text-destructive mt-2 text-sm">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => reopen("edit_pages")}
          >
            Edit pages
          </Button>
          <ConfirmAction
            label="Try again"
            title="Run the extraction again?"
            description="The confirmed pages will be read again. Nothing from the failed attempt is kept."
            confirmLabel="Run again"
            disabled={busy}
            onConfirm={() => reopen("requeue")}
          />
        </div>
      </section>
    );
  }

  return (
    <section className={shell} role="status">
      <div className="max-w-prose">
        <p className="font-display text-xl">Extraction finished</p>
        <p className="text-muted-foreground mt-1 text-sm">
          The values are drafts. Check each against the brochure page shown as
          its evidence before approving.
        </p>
      </div>
      {fieldsHref ? (
        <Button asChild>
          <Link href={fieldsHref}>Review extracted values</Link>
        </Button>
      ) : null}
    </section>
  );
}
