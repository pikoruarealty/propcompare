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
  1: "text-5xl leading-[1.05] tracking-tight md:text-6xl",
  2: "text-4xl leading-[1.1] tracking-tight md:text-5xl",
  3: "text-2xl leading-snug",
};

/** The one oversize step, for a page's opening line (the landing hero). */
const HERO_SIZE = "text-6xl leading-[0.98] tracking-tight md:text-8xl";

export interface DisplayHeadingProps extends React.ComponentProps<
  "h1" | "h2" | "h3"
> {
  /** Heading level; also selects the size step. */
  level?: DisplayLevel;
  /** `hero` sets the line at display scale, larger than any level. */
  size?: "hero";
}

/** Editorial display text: page titles, section headings, property names. */
export function DisplayHeading({
  level = 2,
  size,
  className,
  ...props
}: DisplayHeadingProps) {
  const Tag = `h${level}` as const;

  return (
    <Tag
      data-typography="display"
      className={cn(
        "font-display text-foreground font-normal text-balance",
        size === "hero" ? HERO_SIZE : DISPLAY_SIZES[level],
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

/**
 * The word or phrase in a headline that carries the meaning, set in the accent
 * colour and italic. One per headline: emphasis on everything is emphasis on
 * nothing.
 */
export function Accent({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-typography="accent"
      className={cn("text-primary italic", className)}
      {...props}
    />
  );
}
