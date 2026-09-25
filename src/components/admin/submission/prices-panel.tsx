"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  describeInr,
  describeInrRange,
  groupIndian,
} from "@/lib/pricing/format";
import type { PricesState } from "@/lib/pricing/panel";
import { inputClass, labelClass } from "./form-classes";

/**
 * The Prices tab (owner only; `DECISIONS.md` 2026-09-24, "price data"). One price per
 * unit type, in whole rupees, held privately and applied to the live unit type when
 * the submission is published. RERA's stated range for the project is shown as a
 * reference and is what budget matching falls back on until a unit type is priced.
 *
 * Prices are not shown to buyers anywhere; the panel says so at the top, because that
 * is the first thing a person entering one should read.
 */

const endpoint = (submissionId: string) =>
  `/api/v1/admin/submissions/${submissionId}/prices`;

const shortDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

type RowState = "idle" | "saving" | "saved" | { error: string };

function PriceRow({
  name,
  staged,
  stagedApplied,
  current,
  editable,
  submissionId,
  onState,
}: PricesState["unitTypes"][number] & {
  editable: boolean;
  submissionId: string;
  onState: (state: PricesState) => void;
}) {
  const [text, setText] = React.useState(staged ? groupIndian(staged) : "");
  const [state, setState] = React.useState<RowState>("idle");
  const [held, setHeld] = React.useState(staged ?? "");

  const digits = text.replace(/[\s,]/g, "");
  const preview = describeInr(digits === "" ? null : digits);

  const send = async (init: RequestInit): Promise<PricesState | null> => {
    setState("saving");
    try {
      const response = await fetch(endpoint(submissionId), {
        ...init,
        headers: { "Content-Type": "application/json" },
      });
      const body = await response.json();
      if (!response.ok) {
        setState({
          error: body?.error?.message ?? "That could not be saved.",
        });
        return null;
      }
      setState("saved");
      onState(body as PricesState);
      return body as PricesState;
    } catch {
      setState({ error: "That could not be saved. Try again." });
      return null;
    }
  };

  const commit = async () => {
    if (digits === held) return;
    if (digits === "") {
      setText("");
      return;
    }
    const result = await send({
      method: "PUT",
      body: JSON.stringify({ unitVariantName: name, priceInr: digits }),
    });
    if (result) setHeld(digits);
  };

  const remove = async () => {
    const result = await send({
      method: "DELETE",
      body: JSON.stringify({ unitVariantName: name }),
    });
    if (result) {
      setText("");
      setHeld("");
    }
  };

  const id = `price-${name.replace(/\W+/g, "-")}`;
  return (
    <li
      data-slot="price-row"
      className="border-border flex flex-col gap-2 border-b py-4 last:border-b-0"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <label htmlFor={id} className="text-foreground font-medium">
          {name}
        </label>
        <span className="text-muted-foreground text-sm">
          {current
            ? `Live now: ${describeInr(current) ?? current}`
            : "No live price"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <span
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
          >
            ₹
          </span>
          <input
            id={id}
            inputMode="numeric"
            autoComplete="off"
            disabled={!editable}
            value={text}
            placeholder="Price in rupees"
            onChange={(event) => {
              const next = event.target.value.replace(/[^\d,\s]/g, "");
              setText(groupIndian(next));
              if (state !== "idle") setState("idle");
            }}
            onBlur={() => void commit()}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            className={`${inputClass} pl-7 tabular-nums`}
          />
        </div>
        {preview ? (
          <span className="text-muted-foreground text-sm">{preview}</span>
        ) : null}
        {editable && held !== "" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={state === "saving"}
            onClick={() => void remove()}
          >
            Remove
          </Button>
        ) : null}
      </div>
      <p
        aria-live="polite"
        data-slot="price-state"
        role={typeof state === "object" ? "alert" : undefined}
        className={
          typeof state === "object"
            ? "text-destructive text-sm"
            : "text-muted-foreground min-h-5 text-xs"
        }
      >
        {state === "saving"
          ? "Saving…"
          : typeof state === "object"
            ? state.error
            : held !== ""
              ? stagedApplied
                ? "Applied to the live unit type."
                : "Saved. It becomes the live price when this submission is published."
              : ""}
      </p>
    </li>
  );
}

export function PricesPanel({
  submissionId,
  active,
}: {
  submissionId: string;
  /** The tab is showing; the unit types may have changed since it last did. */
  active: boolean;
}) {
  const [state, setState] = React.useState<PricesState | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [applying, setApplying] = React.useState<string | null>(null);

  // Bumped to load again (the retry link, and after applying prices).
  const [reloadKey, setReloadKey] = React.useState(0);
  const reload = () => setReloadKey((key) => key + 1);

  React.useEffect(() => {
    if (!active) return;
    let cancelled = false;
    fetch(endpoint(submissionId), { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("load failed");
        return response.json() as Promise<PricesState>;
      })
      .then((body) => {
        if (cancelled) return;
        setState(body);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [active, submissionId, reloadKey]);

  const retry = async () => {
    setApplying("Applying…");
    try {
      const response = await fetch(`${endpoint(submissionId)}/apply`, {
        method: "POST",
      });
      const body = await response.json();
      setApplying(
        response.ok
          ? body.unknown.length > 0
            ? `Not applied, no live unit type is called: ${body.unknown.join(", ")}.`
            : "Applied."
          : (body?.error?.message ?? "That could not be applied."),
      );
      reload();
    } catch {
      setApplying("That could not be applied. Try again.");
    }
  };

  const published = state?.submissionStatus === "published";
  const pricedCount = state?.unitTypes.filter(
    (row) => row.staged !== null || row.current !== null,
  ).length;
  const unpriced =
    state?.unitTypes
      .filter((row) => row.staged === null && row.current === null)
      .map((row) => row.name) ?? [];
  const waiting =
    published &&
    state?.unitTypes.some((row) => row.staged && !row.stagedApplied);

  return (
    <div data-slot="prices-panel" className="flex flex-col gap-6 py-6">
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-2xl">Prices</h2>
        <p className="text-muted-foreground max-w-prose text-sm">
          Private. These prices are never shown to buyers anywhere on the site.
          They are used only to match a buyer&apos;s stated budget. One price
          per unit type, in whole rupees.
        </p>
      </div>

      {failed && !state ? (
        <p role="alert" className="text-destructive text-sm">
          The prices could not be loaded.{" "}
          <button
            type="button"
            className="underline underline-offset-4"
            onClick={reload}
          >
            Try again
          </button>
        </p>
      ) : null}

      {state?.unavailable ? (
        <p
          data-slot="prices-unavailable"
          className="border-border bg-muted rounded-md border p-3 text-sm"
        >
          The private price store is not configured on this server, so prices
          cannot be shown or saved here.
        </p>
      ) : null}

      {state && !state.unavailable ? (
        <>
          <section
            data-slot="prices-rera"
            className="border-border bg-card flex flex-col gap-1 rounded-lg border p-4"
          >
            <span className={labelClass}>
              RERA&apos;s range for this project
            </span>
            {state.rera ? (
              <>
                <p className="text-lg">
                  {describeInrRange(state.rera.minInr, state.rera.maxInr)}
                </p>
                <p className="text-muted-foreground text-xs">
                  Checked {shortDate(state.rera.fetchedAt)}. RERA states one
                  range for the whole project, not a price per unit type. Budget
                  matching uses it until a unit type is priced here.
                </p>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                {state.registrationNumber
                  ? "No range yet. Fetch this project's RERA record on the RERA tab, or RERA states none."
                  : "This project has no RERA number yet, so there is no range to fall back on."}
              </p>
            )}
          </section>

          {state.unitTypes.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              This submission has no unit types yet. Add them on the Unit types
              tab, then price them here.
            </p>
          ) : (
            <ul data-slot="price-rows" className="flex flex-col">
              {state.unitTypes.map((row) => (
                <PriceRow
                  key={row.name}
                  {...row}
                  // The server decides: a published property's prices can still be
                  // typed, and apply at once (2026-09-25).
                  editable={state.editable}
                  submissionId={submissionId}
                  onState={setState}
                />
              ))}
            </ul>
          )}

          {state.unitTypes.length > 0 && pricedCount === 0 ? (
            <p
              data-slot="prices-none"
              className="text-muted-foreground text-sm"
            >
              No unit type is priced, so this project matches budgets on
              RERA&apos;s range alone.
            </p>
          ) : null}
          {pricedCount !== undefined &&
          pricedCount > 0 &&
          unpriced.length > 0 ? (
            <p
              data-slot="prices-unpriced"
              className="border-border bg-muted rounded-md border p-3 text-sm"
            >
              Not priced: {unpriced.join(", ")}. Once any unit type has a price,
              RERA&apos;s range no longer applies to this project, so these will
              not match any buyer&apos;s budget until they are priced.
            </p>
          ) : null}

          {state.orphanedStaged.length > 0 ? (
            <p
              data-slot="prices-orphaned"
              className="border-border bg-muted rounded-md border p-3 text-sm"
            >
              A price was typed for a unit type that is no longer listed:{" "}
              {state.orphanedStaged.join(", ")}. It will not be applied.
            </p>
          ) : null}

          {waiting ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm">
                Some typed prices have not reached the live unit types.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={applying === "Applying…"}
                onClick={() => void retry()}
              >
                Apply now
              </Button>
              {applying ? (
                <span className="text-muted-foreground text-sm">
                  {applying}
                </span>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
