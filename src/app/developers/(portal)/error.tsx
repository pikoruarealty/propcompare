"use client";

export default function DeveloperError({ reset }: { reset: () => void }) {
  return (
    <main className="bg-background min-h-screen px-[var(--layout-margin-mobile)] py-16 md:px-[var(--layout-margin-desktop)]">
      <div className="mx-auto max-w-[var(--layout-max-width)]">
        <h1 className="font-display text-4xl">
          The report could not be opened
        </h1>
        <p className="text-muted-foreground mt-3 max-w-prose text-sm">
          Your figures are unchanged. Try loading the report again.
        </p>
        <button
          type="button"
          onClick={reset}
          className="text-primary mt-6 text-sm underline underline-offset-4"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
