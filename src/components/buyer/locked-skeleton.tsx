import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The placeholder for detail a signed-out visitor cannot see yet. The real labels
 * stay (what a row is called is not the fact it protects) and each value is a bar
 * with a highlight sweeping across it, one bar after another (`.lock-bar` in
 * `globals.css`). Bar widths vary in a fixed pattern so a list reads as text that
 * is there but not yet legible, not as a row of identical blocks.
 */
const WIDTHS = ["w-4/5", "w-3/5", "w-2/3", "w-11/12", "w-1/2"] as const;
const STAGGER_MS = 90;

/** One bar. `index` sets where it falls in the wave and which width it takes. */
export function LockedBar({
  index = 0,
  className,
}: {
  index?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      data-slot="locked-bar"
      className={cn("lock-bar h-4", WIDTHS[index % WIDTHS.length], className)}
      style={
        { "--lock-delay": `${index * STAGGER_MS}ms` } as React.CSSProperties
      }
    />
  );
}

/** A picture-shaped tile in the same wave. */
export function LockedTile({
  index = 0,
  className,
}: {
  index?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      data-slot="locked-tile"
      className={cn("lock-bar aspect-[4/3] w-full rounded-md", className)}
      style={
        { "--lock-delay": `${index * STAGGER_MS}ms` } as React.CSSProperties
      }
    />
  );
}
