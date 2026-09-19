"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import type { AcceptInviteState } from "@/app/actions/developer-invite";
import { AuthField } from "./auth-field";

/**
 * Where an invited developer chooses a password. The link's identifiers travel as
 * hidden fields; the server checks them again on submit, so tampering with them
 * gains nothing.
 */
export function AcceptInviteForm({
  action,
  userId,
  token,
}: {
  action: (
    previous: AcceptInviteState,
    formData: FormData,
  ) => Promise<AcceptInviteState>;
  userId: string;
  token: string;
}) {
  const [state, formAction, pending] = React.useActionState(action, {
    error: null,
  });

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="u" value={userId} />
      <input type="hidden" name="t" value={token} />
      <AuthField
        id="name"
        name="name"
        label="Your name (optional)"
        autoComplete="name"
      />
      <AuthField
        id="password"
        name="password"
        label="Choose a password"
        type="password"
        autoComplete="new-password"
        minLength={12}
        required
        hint="At least 12 characters."
      />
      <AuthField
        id="confirm"
        name="confirm"
        label="Repeat the password"
        type="password"
        autoComplete="new-password"
        required
        error={state.error}
      />
      <Button
        type="submit"
        size="lg"
        className="h-12 w-full text-base"
        disabled={pending}
      >
        {pending ? "Setting up…" : "Create my account"}
      </Button>
    </form>
  );
}
