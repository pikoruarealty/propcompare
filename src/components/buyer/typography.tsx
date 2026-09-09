import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Typography primitives for the buyer surface, binding the two documented
 * typefaces to the roles the design guide assigns them: Cormorant Garamond for
 * editorial display text and property names, Plus Jakarta Sans for UI chrome,
 * labels, and body copy, with tabular numerals for areas, dates, and counts.
 *
 * These exist so a screen never reaches for a raw font utility and quietly
 * puts the serif on a data label, or the sans on a property name. See
 * `docs/design/design-tokens.md`.
 */

type DisplayLevel = 1 | 2 | 3;

/**
 * Sizes step on the 8px rhythm and stay deliberately few — the design stance
 * is editorial calm, not a full type scale nobody can hold in their head.
 */
const DISPLAY_SIZES: Record<DisplayLevel, string> = {
  1: "text-4xl leading-tight md:text-5xl",
  2: "text-3xl leading-tight md:text-4xl",
  3: "text-2xl leading-snug",
};

export interface DisplayHeadingProps extends React.ComponentProps<
  "h1" | "h2" | "h3"
> {
  /** Heading level; also selects the size step. */
  level?: DisplayLevel;
}

/** Editorial display text: page titles, section headings, property names. */
export function DisplayHeading({
  level = 2,
  className,
  ...props
}: DisplayHeadingProps) {
  const Tag = `h${level}` as const;

  return (
    <Tag
      data-typography="display"
      className={cn(
        "font-display text-foreground font-normal text-balance",
        DISPLAY_SIZES[level],
        className,
      )}
      {...props}
    />
  );
}

/** Running copy. Plus Jakarta Sans, with a measure that stays readable. */
export function BodyText({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-typography="body"
      className={cn(
        "text-foreground max-w-prose text-base leading-7",
        className,
      )}
      {...props}
    />
  );
}

/** A small caps-tracked label above a heading or beside a fact. */
export function Eyebrow({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-typography="eyebrow"
      className={cn(
        "text-muted-foreground text-xs font-medium tracking-[0.08em] uppercase",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Numeric and quasi-numeric data — areas, dates, counts, RERA numbers.
 *
 * The `data-tabular` class is the documented treatment (`globals.css`), and
 * carrying it here rather than at each call site is the point: a column of
 * areas only lines up if every one of them opts in.
 */
export function TabularValue({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-typography="tabular"
      className={cn("data-tabular", className)}
      {...props}
    />
  );
}
