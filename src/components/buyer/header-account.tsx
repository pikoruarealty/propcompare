"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { isPlaceholderName } from "@/lib/accounts/buyer-name";
import { authClient } from "@/lib/auth-client";

/**
 * The header's account control: "Sign in" when there is no session, "Sign out"
 * when there is.
 *
 * It reads the session in the browser on purpose. A server read in `SiteHeader`
 * would make every buyer page dynamic and defeat the dossier's hourly ISR
 * (`revalidate = 3600`); the cost of doing it here is that the control appears
 * after hydration, so nothing is rendered while the session is still loading
 * rather than flashing the wrong state.
 */
export function HeaderAccount() {
  const { data: session, isPending } = authClient.useSession();
  const pathname = usePathname();
  const router = useRouter();

  if (isPending) return null;

  if (!session) {
    const next =
      pathname && pathname !== "/"
        ? `?next=${encodeURIComponent(pathname)}`
        : "";
    return (
      <Link
        href={`/login${next}`}
        className="text-muted-foreground hover:text-foreground text-sm whitespace-nowrap transition-colors"
      >
        Sign in
      </Link>
    );
  }

  const firstName = isPlaceholderName(session.user.name)
    ? null
    : session.user.name.split(" ")[0];

  return (
    <div className="flex items-center gap-4 text-sm">
      <span className="text-foreground" data-slot="signed-in-as">
        {firstName ? `Hi, ${firstName}` : "Signed in"}
      </span>
      <button
        type="button"
        onClick={async () => {
          await authClient.signOut();
          router.refresh();
        }}
        className="text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
      >
        Sign out
      </button>
    </div>
  );
}
