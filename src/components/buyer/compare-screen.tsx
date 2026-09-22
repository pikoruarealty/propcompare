"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { ChevronDown, Link2, X } from "lucide-react";
import { compareAddress, useCompareSelection } from "@/lib/compare/selection";
import { buildComparison } from "@/lib/compare/model";
import {
  FOCUS_OPTIONS,
  INTAKE_PRIORITIES_KEY,
  focusFromPriorities,
  orderGroups,
  orderSummary,
  type FocusKey,
} from "@/lib/compare/focus";
import { authClient } from "@/lib/auth-client";
import type {
  CompareCell,
  CompareColumn,
  CompareRow,
} from "@/lib/compare/model";
import type { PropertyDossier } from "@/lib/properties/types";
import { cn } from "@/lib/utils";
import { BuyerLoginForm } from "@/components/auth/buyer-login-form";
import { Block } from "./page-skeleton";
import { VerifiedBadge, reraVerifiedFact } from "./verified-badge";
import { ZoomableImage } from "./zoomable-image";

/**
 * The comparison itself (specification: `docs/design/comparison.v1.md`). It draws
 * a `CompareModel` and decides nothing about the data: every value, every
 * difference and every summary line was decided in `buildComparison`.
 *
 * Reading order is the decision order: what changes between the choices, then the
 * rows that differ, with what is identical one click away. Missing facts are said
 * plainly ("Not stated" is an open question, "Not offered" a closed one). On a
 * phone two properties show at a time, with a picker for which two, rather than a
 * table squeezed into unreadable columns.
 */

/** Phone: the two shown properties side by side, label above. From md up: a label
 * column, then every property. The count is a variable so the class is static. */
const PHONE_QUERY = "(max-width: 767px)";
const LONG_SECTIONS = new Set(["amenities", "specifications"]);
const subscribeToPhoneWidth = (listener: () => void) => {
  const query = window.matchMedia?.(PHONE_QUERY);
  query?.addEventListener("change", listener);
  return () => query?.removeEventListener("change", listener);
};

const subscribeToNothing = () => () => {};
const readCarriedPriorities = (): string => {
  try {
    return window.sessionStorage.getItem(INTAKE_PRIORITIES_KEY) ?? "";
  } catch {
    return "";
  }
};

const gridClasses =
  "grid grid-cols-2 md:[grid-template-columns:minmax(6.5rem,11rem)_repeat(var(--cols),minmax(0,1fr))]";
const colsStyle = (count: number) =>
  ({ "--cols": count }) as React.CSSProperties;

function Cell({ cell, hidden }: { cell: CompareCell; hidden: boolean }) {
  return (
    <div
      data-slot="compare-cell"
      className={cn(
        "min-w-0 px-3 pt-1 pb-2.5 text-sm break-words md:py-2.5",
        hidden && "hidden md:block",
      )}
    >
      {cell.state === "not_stated" ? (
        <span
          className="text-muted-foreground italic"
          title="Not stated: nobody has recorded this."
        >
          Not stated
        </span>
      ) : cell.state === "not_offered" ? (
        <span
          className="text-muted-foreground font-medium"
          title="Stated as not offered."
        >
          Not offered
        </span>
      ) : (
        <>
          <span className="data-tabular whitespace-pre-line">{cell.text}</span>
          {cell.largest ? (
            <span className="text-muted-foreground ml-2 text-xs">largest</span>
          ) : null}
          {cell.bar !== null ? (
            <span
              aria-hidden="true"
              className="bg-muted mt-1.5 block h-1.5 rounded-full"
            >
              <span
                className={cn(
                  "block h-full rounded-full",
                  cell.largest ? "bg-primary" : "bg-primary/45",
                )}
                style={{ width: `${Math.round(cell.bar * 100)}%` }}
              />
            </span>
          ) : null}
          {cell.regulatorChecked ? (
            <span
              data-slot="compare-regulator"
              className="text-muted-foreground mt-1 block text-xs"
            >
              Checked against GujRERA
            </span>
          ) : null}
        </>
      )}
    </div>
  );
}

function Row({
  row,
  count,
  visible,
}: {
  row: CompareRow;
  count: number;
  visible: number[];
}) {
  return (
    <div
      role="row"
      data-slot="compare-row"
      data-status={row.status}
      style={colsStyle(count)}
      className={cn(
        gridClasses,
        "border-border border-b last:border-b-0",
        row.status === "differs" && "bg-accent/40",
        row.status === "gap" && "bg-muted/60",
      )}
    >
      <div className="text-muted-foreground col-span-2 px-3 pt-2.5 text-xs md:col-span-1 md:py-2.5 md:text-sm">
        {row.label}
      </div>
      {row.cells.map((cell, i) => (
        <Cell key={i} cell={cell} hidden={!visible.includes(i)} />
      ))}
    </div>
  );
}

/**
 * Each property's floor plan for the unit type it is compared on, side by side.
 * A plan opens in the zoomable viewer with its credit. A property with no plan
 * for that unit type says so; nothing is substituted from another type.
 */
function FloorPlanRow({
  columns,
  visible,
}: {
  columns: CompareColumn[];
  visible: number[];
}) {
  const [open, setOpen] = React.useState<{
    column: CompareColumn;
    index: number;
  } | null>(null);
  const plan = open ? open.column.floorPlans[open.index] : undefined;
  const label = open
    ? `${open.column.name}, ${open.column.variant?.shortName ?? "floor plan"}`
    : "";

  return (
    <div
      role="row"
      data-slot="compare-plan-row"
      style={colsStyle(columns.length)}
      className={cn(gridClasses, "border-border border-b")}
    >
      <div className="text-muted-foreground col-span-2 px-3 pt-2.5 text-xs md:col-span-1 md:py-2.5 md:text-sm">
        Floor plan
      </div>
      {columns.map((column, i) => (
        <div
          key={column.slug}
          data-slot="compare-cell"
          className={cn(
            "min-w-0 px-3 pt-1 pb-3 md:py-2.5",
            !visible.includes(i) && "hidden md:block",
          )}
        >
          {column.floorPlans.length === 0 ? (
            <span
              className="text-muted-foreground text-sm italic"
              title="No floor plan has been published for this unit type."
            >
              Not stated
            </span>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {column.floorPlans.map((item, index) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setOpen({ column, index })}
                    aria-label={`Open the floor plan for ${column.name}, ${index + 1} of ${column.floorPlans.length}`}
                    className="border-border bg-tone-deep focus-visible:ring-ring block h-28 w-24 overflow-hidden rounded-md border focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- a served thumbnail, not a static asset */}
                    <img
                      src={`/api/v1/media/${item.id}?size=thumb`}
                      alt=""
                      loading="lazy"
                      className="size-full object-contain"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <Dialog.Root
        open={plan !== undefined}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-[color-mix(in_oklab,var(--color-ink)_75%,transparent)]" />
          <Dialog.Content
            data-slot="plan-lightbox"
            aria-describedby={undefined}
            className="bg-card fixed top-1/2 left-1/2 z-50 flex max-h-[92vh] w-[calc(100%-1.5rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-lg border p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <Dialog.Title className="font-display text-xl">
                {label}
              </Dialog.Title>
              <Dialog.Close
                aria-label="Close"
                className="text-muted-foreground hover:text-foreground rounded-md p-1"
              >
                <X className="size-5" aria-hidden="true" />
              </Dialog.Close>
            </div>
            {plan ? (
              <ZoomableImage
                key={plan.id}
                src={`/api/v1/media/${plan.id}`}
                alt={label}
              />
            ) : null}
            {plan?.attribution ? (
              <p className="text-muted-foreground text-sm">
                Credit: {plan.attribution}
              </p>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

/**
 * A locked row: the real label (a row's name is not the fact it protects),
 * skeleton blocks where its values would be. Same grid shape as `Row`, so
 * signing in swaps the row's contents without the table reflowing.
 * `docs/design/no-vibecoded-tells.v1.md` rule 21: a tonal `Block`, the single
 * pulse, nothing decorative.
 */
function LockedRow({ label, count }: { label: string; count: number }) {
  return (
    <div
      role="row"
      data-slot="compare-row-locked"
      style={colsStyle(count)}
      className={cn(gridClasses, "border-border border-b last:border-b-0")}
    >
      <div className="text-muted-foreground col-span-2 px-3 pt-2.5 text-xs md:col-span-1 md:py-2.5 md:text-sm">
        {label}
      </div>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="min-w-0 px-3 pt-1 pb-2.5 md:py-2.5">
          <Block className="h-4 w-4/5" />
        </div>
      ))}
    </div>
  );
}

/**
 * Shown once, above the locked sections, never once per group — a buyer who
 * has already decided not to sign in does not need to be asked seven times.
 * Embeds the same phone-OTP form used everywhere else a buyer signs in
 * (`BuyerLoginForm`), rather than sending them off `/compare` to a separate
 * page and back.
 */
function ComparisonSignInPrompt() {
  const here =
    typeof window === "undefined"
      ? "/compare"
      : window.location.pathname + window.location.search;
  return (
    <div
      data-slot="compare-sign-in"
      className="border-border bg-card flex flex-col gap-4 border-b p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-xl">
          Sign in to see the rest of this comparison
        </h2>
        <p className="text-muted-foreground text-sm">
          What each property is and how they differ at a glance is above.
          Possession, rooms, amenities, specifications and RERA detail unlock
          with your phone number — no email, no password.
        </p>
      </div>
      <div className="max-w-sm">
        <BuyerLoginForm returnTo={here} />
      </div>
    </div>
  );
}

/**
 * Saving a comparison is the one part of comparing that needs an account. Signed
 * out, it is a link to sign in that returns to this comparison; signed in, it
 * stores the properties and unit types on screen (`POST /api/v1/comparisons`).
 */
function SaveComparisonButton({ columns }: { columns: CompareColumn[] }) {
  const { data: session, isPending } = authClient.useSession();
  const [state, setState] = React.useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  if (isPending) return null;
  const buttonClass =
    "border-border hover:border-primary inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium";

  if (!session) {
    const here =
      typeof window === "undefined"
        ? "/compare"
        : window.location.pathname + window.location.search;
    return (
      <Link
        href={`/login?next=${encodeURIComponent(here)}`}
        data-slot="save-comparison"
        className={buttonClass}
      >
        Sign in to save this comparison
      </Link>
    );
  }
  if (state === "saved") {
    return (
      <span data-slot="save-comparison" role="status" className="text-sm">
        Saved.{" "}
        <Link
          href="/saved"
          className="text-primary underline underline-offset-4"
        >
          See your saved list
        </Link>
      </span>
    );
  }
  const save = async () => {
    setState("saving");
    try {
      const response = await fetch("/api/v1/comparisons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: columns.map((column) => ({
            propertyId: column.propertyId,
            ...(column.variant ? { unitVariantId: column.variant.id } : {}),
          })),
        }),
      });
      setState(response.ok ? "saved" : "error");
    } catch {
      setState("error");
    }
  };
  return (
    <span className="inline-flex items-center gap-3">
      <button
        type="button"
        data-slot="save-comparison"
        disabled={state === "saving"}
        onClick={save}
        className={buttonClass}
      >
        {state === "saving" ? "Saving…" : "Save this comparison"}
      </button>
      {state === "error" ? (
        <span role="alert" className="text-destructive text-sm">
          Could not save. Try again.
        </span>
      ) : null}
    </span>
  );
}

function ColumnHeader({
  column,
  hidden,
  onRemove,
  onPickVariant,
}: {
  column: CompareColumn;
  hidden: boolean;
  onRemove: () => void;
  onPickVariant: (variantId: string) => void;
}) {
  const badge = reraVerifiedFact({
    registered: column.reraRegistered,
    registrationNumber: column.registrationNumber,
    lastVerifiedAt: null,
  });
  return (
    <div
      data-slot="compare-column-header"
      className={cn("min-w-0 px-3 py-3", hidden && "hidden md:block")}
    >
      {column.primaryMediaId ? (
        // A plate above each name, so the columns are recognisable at a glance.
        // eslint-disable-next-line @next/next/no-img-element -- a served thumbnail, not a static asset
        <img
          src={`/api/v1/media/${column.primaryMediaId}?size=thumb`}
          alt=""
          className="bg-tone-deep mb-3 hidden h-20 w-full rounded-md object-cover md:block"
        />
      ) : null}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link
            href={`/properties/${column.slug}`}
            className="font-display text-foreground block truncate text-lg leading-tight hover:underline"
          >
            {column.name}
          </Link>
          <p className="text-muted-foreground truncate text-xs">
            {column.locality}, {column.city}
          </p>
          <Link
            href={`/developer/${column.developerId}`}
            data-slot="compare-developer"
            className="text-muted-foreground block truncate text-xs underline underline-offset-4"
          >
            {column.developerName}
          </Link>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${column.name} from the comparison`}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -mt-1 -mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded focus-visible:ring-2 focus-visible:outline-none"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-2">
        <VerifiedBadge fact={badge} />
      </div>
      {column.variants.length > 0 ? (
        <div className="mt-2" data-slot="compare-variant-picker">
          <span
            id={`variant-label-${column.slug}`}
            className="text-muted-foreground block text-xs"
          >
            Comparing unit type
          </span>
          {column.variants.length <= 3 ? (
            <div
              role="group"
              aria-labelledby={`variant-label-${column.slug}`}
              className="mt-1 flex flex-wrap gap-1"
            >
              {column.variants.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  title={option.name}
                  aria-pressed={column.variant?.id === option.id}
                  onClick={() => onPickVariant(option.id)}
                  className={cn(
                    "focus-visible:ring-ring max-w-full truncate rounded-md border px-2 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none",
                    column.variant?.id === option.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:border-primary",
                  )}
                >
                  {option.shortName}
                </button>
              ))}
            </div>
          ) : (
            <select
              aria-labelledby={`variant-label-${column.slug}`}
              value={column.variant?.id ?? ""}
              onChange={(event) => onPickVariant(event.target.value)}
              className="border-input bg-card mt-1 w-full min-w-0 rounded-md border px-2 py-1.5 text-sm"
            >
              {column.variants.map((option) => (
                <option key={option.id} value={option.id} title={option.name}>
                  {option.shortName}
                </option>
              ))}
            </select>
          )}
          {column.variantChosenBy === "bhk" ? (
            <span className="text-muted-foreground mt-1 block text-xs">
              Matched by configuration
            </span>
          ) : column.variantChosenBy === "area" ? (
            <span className="text-muted-foreground mt-1 block text-xs">
              Matched by nearest carpet area
            </span>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground mt-2 text-xs italic">
          No unit types published
        </p>
      )}
    </div>
  );
}

export function CompareScreen({
  dossiers: initialDossiers,
  requested: initialRequested,
  focus: initialFocus = [],
}: {
  dossiers: PropertyDossier[];
  /** The unit type the address asked for, by slug. */
  requested: Record<string, string>;
  /** The focus chips the address asked for. */
  focus?: FocusKey[];
}) {
  const router = useRouter();
  const selection = useCompareSelection();
  // The column identity block and the summary are open to everyone; the row
  // groups below them lock until there is a session (owner direction,
  // `DECISIONS.md` 2026-09-22 — supersedes the earlier "no sign-in to
  // compare" rule). A plain session check, the same one `SaveComparisonButton`
  // already makes — not the separate `dossier_unlocks` table, which records a
  // different fact (a phone-verified unlock against one property).
  const { data: session } = authClient.useSession();
  const signedIn = Boolean(session);
  // The properties and the chosen unit types live here, so switching a unit type
  // or dropping a property redraws the table at once; the address follows.
  const [dossiers, setDossiers] = React.useState(initialDossiers);
  const [requested, setRequested] =
    React.useState<Record<string, string>>(initialRequested);
  const model = React.useMemo(
    () => buildComparison(dossiers, requested),
    [dossiers, requested],
  );
  // With no focus in the address, start from what guided intake said mattered:
  // only the priorities (never the stated range), kept in this tab. Read as an
  // external store so the server's first render and the browser's agree.
  const carriedRaw = React.useSyncExternalStore(
    subscribeToNothing,
    readCarriedPriorities,
    () => "",
  );
  const carried = React.useMemo(() => {
    try {
      const priorities: unknown = carriedRaw ? JSON.parse(carriedRaw) : [];
      return Array.isArray(priorities)
        ? focusFromPriorities(
            priorities.filter((p): p is string => typeof p === "string"),
          )
        : [];
    } catch {
      return [];
    }
  }, [carriedRaw]);
  const [chosenFocus, setFocus] = React.useState<FocusKey[] | null>(null);
  const focus =
    chosenFocus ?? (initialFocus.length > 0 ? initialFocus : carried);
  const [pair, setPair] = React.useState<[number, number]>([0, 1]);
  const [copied, setCopied] = React.useState(false);
  // A section's open state is the person's own choice if they made one, else the
  // default: on a phone the long lists (amenities, specifications) start closed so
  // the decision-shaped sections are what is on screen. The phone test is an
  // external store, so the first render matches the server's.
  const isPhone = React.useSyncExternalStore(
    subscribeToPhoneWidth,
    () => window.matchMedia?.(PHONE_QUERY).matches ?? false,
    () => false,
  );
  const [chosen, setChosen] = React.useState<Record<string, boolean>>({});
  const isOpen = (key: string) =>
    chosen[key] ?? !(isPhone && LONG_SECTIONS.has(key));
  const toggleGroup = (key: string) =>
    setChosen((current) => ({ ...current, [key]: !isOpen(key) }));

  const count = model.columns.length;
  const slugs = model.columns.map((column) => column.slug);

  // The address is the source of truth: keep the tray in step with it.
  const { replace } = selection;
  const key = JSON.stringify(
    model.columns.map((column) => [
      column.slug,
      column.name,
      column.primaryMediaId,
    ]),
  );
  React.useEffect(() => {
    replace(
      model.columns.map((column) => ({
        slug: column.slug,
        name: column.name,
        mediaId: column.primaryMediaId,
      })),
    );
    // `key` captures the columns' identity; `replace` is stable.
  }, [key, replace]); // eslint-disable-line react-hooks/exhaustive-deps

  const address = (
    nextSlugs: string[],
    nextRequested: Record<string, string>,
    nextFocus: FocusKey[] = focus,
  ) => {
    const params = new URLSearchParams();
    params.set("p", nextSlugs.join(","));
    const chosen = nextSlugs
      .filter((slug) => nextRequested[slug])
      .map((slug) => `${slug}~${nextRequested[slug]}`);
    if (chosen.length > 0) params.set("v", chosen.join(","));
    if (nextFocus.length > 0) params.set("f", nextFocus.join(","));
    return `/compare?${params.toString().replace(/%2C/g, ",").replace(/%7E/g, "~")}`;
  };

  const remove = (slug: string) => {
    selection.remove(slug);
    const rest = slugs.filter((other) => other !== slug);
    if (rest.length < 2) {
      router.push(rest.length === 0 ? "/compare" : address(rest, requested));
      return;
    }
    setDossiers((current) => current.filter((d) => d.slug !== slug));
    window.history.replaceState(null, "", address(rest, requested));
  };
  const pickVariant = (slug: string, variantId: string) => {
    const next = { ...requested, [slug]: variantId };
    setRequested(next);
    window.history.replaceState(null, "", address(slugs, next));
  };

  const toggleFocus = (key: FocusKey) => {
    const next = FOCUS_OPTIONS.map((option) => option.key).filter((k) =>
      k === key ? !focus.includes(k) : focus.includes(k),
    );
    setFocus(next);
    window.history.replaceState(null, "", address(slugs, requested, next));
  };

  const visible = count <= 2 ? [...slugs.keys()] : pair;
  const shownGroups = React.useMemo(
    () => orderGroups(model.groups, focus),
    [model.groups, focus],
  );
  const summary = React.useMemo(
    () => orderSummary(model.summary, model.groups, focus),
    [model.summary, model.groups, focus],
  );

  const allOpen = shownGroups.every((group) => isOpen(group.key));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable: the address bar still holds the link.
    }
  };

  return (
    <div data-slot="compare-screen" className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-4xl leading-tight">
            {model.columns.map((column) => column.name).join(" against ")}
          </h1>
          <p className="text-muted-foreground max-w-prose text-sm">
            Compared on the same unit type, on published facts only. No price is
            shown, and nothing is ranked: this shows what each choice gives and
            gives up.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SaveComparisonButton columns={model.columns} />
          <button
            type="button"
            onClick={copy}
            className="border-border hover:border-primary inline-flex h-10 items-center gap-2 rounded-md border px-4 text-sm font-medium"
          >
            <Link2 className="size-4" aria-hidden="true" />
            {copied ? "Link copied" : "Copy link"}
          </button>
        </div>
      </div>

      <div
        role="group"
        aria-label="What matters most to you"
        data-slot="compare-focus"
        className="flex flex-wrap items-center gap-2"
      >
        <span className="text-muted-foreground text-sm">Bring to the top</span>
        {FOCUS_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={focus.includes(option.key)}
            onClick={() => toggleFocus(option.key)}
            className={cn(
              "focus-visible:ring-ring rounded-full border px-3 py-1 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none",
              focus.includes(option.key)
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:border-primary",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <section
        data-slot="compare-summary"
        aria-labelledby="compare-summary-heading"
        className="border-border bg-card rounded-lg border p-6"
      >
        <h2 id="compare-summary-heading" className="font-display text-2xl">
          What changes between these choices
        </h2>
        {summary.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2 text-base">
            {summary.map((line) => (
              <li key={line.rowKey} data-slot="compare-summary-line">
                {line.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground mt-2 text-sm">
            Not enough is stated on every side to say what differs. The table
            below shows what each property states.
          </p>
        )}
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() =>
            setChosen(
              Object.fromEntries(
                shownGroups.map((group) => [group.key, !allOpen]),
              ),
            )
          }
          className="text-primary text-sm underline underline-offset-4"
        >
          {allOpen ? "Collapse all sections" : "Expand all sections"}
        </button>
      </div>

      {count > 2 ? (
        <div
          className="flex flex-wrap items-center gap-3 md:hidden"
          data-slot="compare-pair"
        >
          <span className="text-muted-foreground text-sm">Showing</span>
          {[0, 1].map((side) => (
            <select
              key={side}
              aria-label={side === 0 ? "First property" : "Second property"}
              value={pair[side]}
              onChange={(event) => {
                const next: [number, number] = [...pair] as [number, number];
                next[side] = Number(event.target.value);
                if (next[0] === next[1]) next[1 - side] = pair[side];
                setPair(next);
              }}
              className="border-input bg-card min-w-0 flex-1 rounded-md border px-2 py-1.5 text-sm"
            >
              {model.columns.map((column, i) => (
                <option key={column.slug} value={i}>
                  {column.name}
                </option>
              ))}
            </select>
          ))}
        </div>
      ) : null}

      <div
        role="table"
        aria-label="Comparison"
        className="border-border bg-card rounded-lg border"
      >
        <div
          role="row"
          style={colsStyle(count)}
          className={cn(
            gridClasses,
            "border-border bg-card sticky top-0 z-30 rounded-t-lg border-b",
          )}
        >
          <div className="hidden px-3 py-3 md:block" />
          {model.columns.map((column, i) => (
            <ColumnHeader
              key={column.slug}
              column={column}
              hidden={!visible.includes(i)}
              onRemove={() => remove(column.slug)}
              onPickVariant={(variantId) => pickVariant(column.slug, variantId)}
            />
          ))}
        </div>

        {!signedIn && shownGroups.length > 0 ? (
          <ComparisonSignInPrompt />
        ) : null}

        {shownGroups.length === 0 ? (
          <p className="text-muted-foreground p-6 text-sm">
            Nothing is stated for these properties yet.
          </p>
        ) : (
          shownGroups.map((group) => {
            const open = isOpen(group.key);
            return (
              <section
                key={group.key}
                data-slot="compare-group"
                data-group={group.key}
                data-open={open}
                data-locked={!signedIn}
              >
                <h2>
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={`compare-group-${group.key}`}
                    aria-label={`${group.title} section`}
                    onClick={() => toggleGroup(group.key)}
                    className="bg-muted text-muted-foreground border-border hover:text-foreground focus-visible:ring-ring flex w-full items-center justify-between gap-3 border-y px-3 py-2.5 text-left text-xs font-semibold tracking-[0.08em] uppercase focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <span aria-hidden="true">{group.title}</span>
                    <ChevronDown
                      aria-hidden="true"
                      className={cn(
                        "size-4 transition-transform",
                        open && "rotate-180",
                      )}
                    />
                  </button>
                </h2>
                {open ? (
                  <div id={`compare-group-${group.key}`}>
                    {!signedIn ? (
                      <>
                        {group.key === "rooms" ? (
                          <LockedRow label="Floor plan" count={count} />
                        ) : null}
                        {group.rows.map((row) => (
                          <LockedRow
                            key={row.key}
                            label={row.label}
                            count={count}
                          />
                        ))}
                      </>
                    ) : (
                      <>
                        {group.key === "rooms" ? (
                          <FloorPlanRow
                            columns={model.columns}
                            visible={visible}
                          />
                        ) : null}
                        {group.rows.map((row) => (
                          <Row
                            key={row.key}
                            row={row}
                            count={count}
                            visible={visible}
                          />
                        ))}
                      </>
                    )}
                  </div>
                ) : null}
              </section>
            );
          })
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        &ldquo;Not stated&rdquo; means nobody has recorded the fact; &ldquo;Not
        offered&rdquo; means it was stated as not offered. A shaded row differs
        between the properties; a grey row is stated for some and not others.
      </p>
    </div>
  );
}

export function CompareEmpty({ found }: { found: number }) {
  const { items } = useCompareSelection();
  return (
    <div data-slot="compare-empty" className="flex flex-col gap-4">
      <h1 className="font-display text-4xl">Compare properties</h1>
      <p className="text-muted-foreground max-w-prose">
        {found === 1
          ? "Add at least one more property to compare it against."
          : "Pick two or three properties with the Compare button on a property card or page, and see what really differs between them: the same unit type, side by side, with what is stated and what is not."}
      </p>
      {items.length >= 2 ? (
        <Link
          href={compareAddress(items.map((item) => item.slug))}
          className="bg-primary text-primary-foreground inline-flex h-11 w-fit items-center rounded-md px-6 text-sm font-medium"
        >
          Compare your {items.length} picks
        </Link>
      ) : null}
      <Link
        href="/properties"
        className="text-primary w-fit text-sm underline underline-offset-4"
      >
        Browse properties
      </Link>
    </div>
  );
}
