import Link from "next/link";
import { LogOut, Users } from "lucide-react";
import { signOutOfPortal } from "@/app/actions/portal-auth";
import { cn } from "@/lib/utils";

/**
 * The admin console frame, after the Stitch "Editorial Desk" layout: a chalk
 * sidebar with a serif wordmark and navigation, and a main column that holds
 * white tonal panels on the chalk canvas. It is deliberately its own shell, not
 * the buyer `PageFrame` — the two surfaces are separately permissioned and
 * separately designed (DECISIONS.md 2026-08-31).
 *
 * Only destinations that exist are listed; a nav entry for a screen that is not
 * built yet would be a dead end. Add entries as each slice lands.
 */
export const ADMIN_NAV = [
  {
    key: "developers",
    href: "/admin/developers",
    label: "Developers",
    icon: Users,
  },
] as const;

export type AdminNavKey = (typeof ADMIN_NAV)[number]["key"];

export function AdminShell({
  active,
  email,
  children,
}: {
  active: AdminNavKey;
  email: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col md:flex-row">
      <aside className="border-border bg-muted/40 flex shrink-0 flex-col gap-6 border-b p-6 md:w-64 md:border-r md:border-b-0">
        <div>
          <Link
            href="/admin"
            className="font-display text-primary text-2xl leading-none"
          >
            PropCompare
          </Link>
          <p className="text-muted-foreground mt-2 text-xs font-semibold tracking-[0.1em] uppercase">
            Admin console
          </p>
        </div>

        <nav aria-label="Admin" className="flex-1">
          <ul className="flex gap-2 md:flex-col">
            {ADMIN_NAV.map(({ key, href, label, icon: Icon }) => (
              <li key={key}>
                <Link
                  href={href}
                  aria-current={key === active ? "page" : undefined}
                  className={cn(
                    "font-display flex items-center gap-3 rounded-md px-3 py-2 text-lg transition-colors",
                    key === active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-border border-t pt-4">
          <p
            className="text-muted-foreground mb-3 truncate text-sm"
            title={email}
          >
            {email}
          </p>
          <form action={signOutOfPortal}>
            <input type="hidden" name="to" value="admin" />
            <button
              type="submit"
              className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-sm transition-colors"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-[var(--layout-margin-mobile)] py-10 md:px-12 md:py-14">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}

/** A page title block: serif heading, one-line description, optional action. */
export function AdminPageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-foreground text-4xl leading-tight md:text-5xl">
          {title}
        </h1>
        <p className="text-muted-foreground mt-2 max-w-prose text-base">
          {description}
        </p>
      </div>
      {action}
    </header>
  );
}
