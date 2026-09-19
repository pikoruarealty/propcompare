import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A labelled input in the design system's form style: `label-caps` above, a 1px
 * border, terracotta on focus. The error is tied to the input with
 * `aria-describedby` and `aria-invalid`, so it is announced rather than merely
 * coloured.
 */
export function AuthField({
  label,
  error,
  hint,
  prefix,
  className,
  id,
  ...props
}: React.ComponentProps<"input"> & {
  label: string;
  id: string;
  error?: string | null;
  hint?: string;
  /** Fixed text shown inside the field's left edge, such as a country code. */
  prefix?: string;
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className="text-muted-foreground text-xs font-semibold tracking-[0.1em] uppercase"
      >
        {label}
      </label>
      <div
        className={cn(
          "border-input bg-card focus-within:border-ring flex h-12 items-stretch overflow-hidden rounded-md border transition-colors",
          error && "border-destructive",
        )}
      >
        {prefix ? (
          <span
            aria-hidden="true"
            className="border-input bg-muted text-muted-foreground flex items-center border-r px-3 text-sm"
          >
            {prefix}
          </span>
        ) : null}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "text-foreground placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent px-3 text-base outline-none",
            className,
          )}
          {...props}
        />
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-muted-foreground text-sm">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
