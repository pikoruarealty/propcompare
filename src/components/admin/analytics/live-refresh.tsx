"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

const EVERY_MS = 60_000;

const time = new Intl.DateTimeFormat("en-IN", {
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

/**
 * Keeps the Analytics screen current: it is read from the raw events on the
 * server, and this asks for a fresh read every minute while the tab is visible.
 */
export function LiveRefresh({ readAt }: { readAt: string }) {
  const router = useRouter();
  React.useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, EVERY_MS);
    return () => window.clearInterval(id);
  }, [router]);
  return (
    <p data-slot="analytics-live" className="text-muted-foreground text-sm">
      Live. Updated at {time.format(new Date(readAt))}, and every minute while
      this tab is open.
    </p>
  );
}
