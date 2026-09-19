import { Button } from "@/components/ui/button";
import {
  BodyText,
  DisplayHeading,
  Eyebrow,
} from "@/components/buyer/typography";
import { signOutOfPortal } from "@/app/actions/portal-auth";

/**
 * Holding page for a portal's home until its real screens land (developer
 * submission flow and admin queue — docs/tasklists/2026-09-18-phase-2a-completion.md
 * steps 2 and 3). It exists so sign-in has a real, guarded place to arrive at
 * and the role boundary can be exercised end to end; it deliberately promises
 * nothing the portal cannot yet do.
 */
export function PortalLanding({
  portal,
  email,
}: {
  portal: "developer" | "admin";
  email: string;
}) {
  return (
    <main className="bg-background min-h-screen px-[var(--layout-margin-mobile)] py-16 md:px-[var(--layout-margin-desktop)]">
      <div className="mx-auto max-w-[var(--layout-max-width)]">
        <Eyebrow>
          {portal === "admin" ? "Admin console" : "Developer portal"}
        </Eyebrow>
        <DisplayHeading level={1} className="mt-3">
          You&apos;re signed in
        </DisplayHeading>
        <BodyText className="text-muted-foreground mt-4">
          Signed in as {email}. The{" "}
          {portal === "admin" ? "submission queue" : "submission flow"} is being
          built and will appear here.
        </BodyText>
        <form action={signOutOfPortal} className="mt-8">
          <input type="hidden" name="to" value={portal} />
          <Button
            type="submit"
            variant="outline"
            size="lg"
            className="h-11 px-5"
          >
            Sign out
          </Button>
        </form>
      </div>
    </main>
  );
}
