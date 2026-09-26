import Link from "next/link";
import type { ReactNode } from "react";
import { signOutOfPortal } from "@/app/actions/portal-auth";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/buyer/typography";
import { cn } from "@/lib/utils";

/** Separate from the admin shell: every page performs its own role check. */
export function DeveloperShell({
  active,
  email,
  children,
}: {
  active: "analytics" | "enquiries";
  email: string;
  children: ReactNode;
}) {
  return (
    <main className="bg-background min-h-screen px-[var(--layout-margin-mobile)] py-8 md:px-[var(--layout-margin-desktop)] md:py-12">
      <div className="mx-auto max-w-[var(--layout-max-width)]">
        <header className="border-border flex flex-wrap items-center justify-between gap-5 border-b pb-6">
          <div>
            <Eyebrow>PropCompare</Eyebrow>
            <p className="font-display mt-1 text-2xl">Developer portal</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span
              className="text-muted-foreground max-w-48 truncate text-xs"
              title={email}
            >
              {email}
            </span>
            <form action={signOutOfPortal}>
              <input type="hidden" name="to" value="developer" />
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </header>
        <nav
          aria-label="Developer portal"
          className="border-border flex gap-6 border-b py-4 text-sm"
        >
          <Link
            href="/developers"
            aria-current={active === "analytics" ? "page" : undefined}
            className={cn(
              "underline-offset-4 hover:underline",
              active === "analytics"
                ? "text-foreground font-semibold"
                : "text-muted-foreground",
            )}
          >
            Analytics
          </Link>
          <Link
            href="/developers/enquiries"
            aria-current={active === "enquiries" ? "page" : undefined}
            className={cn(
              "underline-offset-4 hover:underline",
              active === "enquiries"
                ? "text-foreground font-semibold"
                : "text-muted-foreground",
            )}
          >
            Forwarded enquiries
          </Link>
        </nav>
        {children}
      </div>
    </main>
  );
}
