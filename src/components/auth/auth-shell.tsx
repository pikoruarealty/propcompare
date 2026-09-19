import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { BodyText, DisplayHeading } from "@/components/buyer/typography";

/**
 * The one frame all three sign-in screens share, so a buyer, a developer and an
 * admin arrive somewhere that is recognisably the same product: chalk canvas,
 * the wordmark, and a single white panel carrying an icon, a serif heading, and
 * the form. It follows the unlock-gate screen in the Stitch export — no
 * illustration, no marketing, one task.
 *
 * The panel uses the documented tonal layer (white on chalk with a 1px border
 * and a 4% ink lift), not a heavy shadow.
 */
export function AuthShell({
  icon: Icon,
  title,
  description,
  children,
  footer,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="bg-background flex min-h-screen flex-col items-center px-[var(--layout-margin-mobile)] py-10 md:justify-center">
      <Link
        href="/"
        className="font-display text-foreground mb-8 text-2xl leading-none"
      >
        PropCompare
      </Link>

      <section
        aria-labelledby="auth-heading"
        className="border-border bg-card w-full max-w-md rounded-lg border p-8 shadow-[0_4px_20px_color-mix(in_oklab,var(--color-ink)_4%,transparent)]"
      >
        <div className="flex flex-col items-center text-center">
          <span
            aria-hidden="true"
            className="border-border bg-accent text-primary flex size-12 items-center justify-center rounded-full border"
          >
            <Icon className="size-5" />
          </span>
          <DisplayHeading
            id="auth-heading"
            level={2}
            className="mt-6 text-3xl md:text-3xl"
          >
            {title}
          </DisplayHeading>
          <BodyText className="text-muted-foreground mt-3 text-sm leading-6">
            {description}
          </BodyText>
        </div>

        <div className="mt-8">{children}</div>
      </section>

      {footer ? (
        <div className="text-muted-foreground mt-6 max-w-md text-center text-sm">
          {footer}
        </div>
      ) : null}
    </main>
  );
}
