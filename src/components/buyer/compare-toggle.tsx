"use client";

import { Check, Plus } from "lucide-react";
import { MAX_COMPARED } from "@/lib/compare/model";
import { useCompareSelection } from "@/lib/compare/selection";
import { cn } from "@/lib/utils";

/**
 * "Compare" on a property card and the dossier. It adds the property to the
 * browser's comparison set (see `useCompareSelection`); the tray at the bottom of
 * the page shows the set and opens the comparison. A fifth property is refused
 * with a reason, because more than three is a list, not a comparison.
 */
export function CompareToggle({
  slug,
  name,
  mediaId,
  className,
}: {
  slug: string;
  name: string;
  mediaId: string | null;
  className?: string;
}) {
  const { has, add, remove, full } = useCompareSelection();
  const selected = has(slug);
  const blocked = full && !selected;

  return (
    <button
      type="button"
      data-slot="compare-toggle"
      aria-pressed={selected}
      aria-label={
        selected
          ? `Remove ${name} from the comparison`
          : `Add ${name} to the comparison`
      }
      disabled={blocked}
      title={
        blocked
          ? `You can compare up to ${MAX_COMPARED} properties. Remove one first.`
          : undefined
      }
      onClick={() => (selected ? remove(slug) : add({ slug, name, mediaId }))}
      className={cn(
        "border-border inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-card text-foreground hover:border-primary",
        blocked && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      {selected ? (
        <Check className="size-4" aria-hidden="true" />
      ) : (
        <Plus className="size-4" aria-hidden="true" />
      )}
      {selected ? "Added to compare" : "Compare"}
    </button>
  );
}
