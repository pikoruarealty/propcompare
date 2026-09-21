"use client";

import * as React from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const SAVED_URL = "/api/v1/saved-properties";
const BUTTON_CLASS =
  "border-border inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium transition-colors focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none";

/**
 * "Save" on a dossier. Saving is the one buyer action that needs an account, so a
 * visitor who is not signed in gets a link to sign in that returns to this page.
 * Whether the property is already saved is read once the session is known; the
 * button then toggles it (`POST` and `DELETE` on the saved-properties route, both
 * idempotent). A failure says so and leaves the state as it was.
 */
export function SavePropertyButton({
  propertyId,
  slug,
  className,
}: {
  propertyId: string;
  slug: string;
  className?: string;
}) {
  const { data: session, isPending } = authClient.useSession();
  const [saved, setSaved] = React.useState<boolean | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const signedIn = Boolean(session);

  React.useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${SAVED_URL}?page=1&pageSize=50`);
        if (!response.ok) return;
        const body = (await response.json()) as {
          data: { property: { id: string } }[];
        };
        if (!cancelled) {
          setSaved(body.data.some((entry) => entry.property.id === propertyId));
        }
      } catch {
        // Unknown: the button still works, it just starts as "Save".
        if (!cancelled) setSaved(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, propertyId]);

  if (isPending) return null;

  if (!signedIn) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(`/properties/${slug}`)}`}
        data-slot="save-property"
        className={cn(BUTTON_CLASS, "bg-card hover:border-primary", className)}
      >
        Sign in to save
      </Link>
    );
  }

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(SAVED_URL, {
        method: saved ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId }),
      });
      if (!response.ok && response.status !== 404) {
        throw new Error("failed");
      }
      setSaved(!saved);
    } catch {
      setError("Could not update your saved list. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        data-slot="save-property"
        aria-pressed={saved === true}
        disabled={busy}
        onClick={toggle}
        className={cn(
          BUTTON_CLASS,
          saved
            ? "border-primary bg-primary text-primary-foreground"
            : "bg-card text-foreground hover:border-primary",
          className,
        )}
      >
        {saved ? "Saved" : "Save"}
      </button>
      {error ? (
        <span
          role="alert"
          className="bg-card text-destructive rounded px-2 py-1 text-xs"
        >
          {error}
        </span>
      ) : null}
    </span>
  );
}
