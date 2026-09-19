"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { AuthField } from "./auth-field";

export interface PasswordLoginState {
  error: string | null;
  /** Echoed back so a failed attempt does not clear what was typed. */
  email: string;
}

/**
 * Email + password form for the developer and admin sign-in screens. The action
 * is a server action passed in by each page, because the role check has to run
 * on the server before a session exists. A failed attempt returns one generic
 * message and keeps the email the person typed.
 */
export function PasswordLoginForm({
  action,
  returnTo,
}: {
  action: (
    previous: PasswordLoginState,
    formData: FormData,
  ) => Promise<PasswordLoginState>;
  returnTo: string;
}) {
  const [state, formAction, pending] = React.useActionState(action, {
    error: null,
    email: "",
  });

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="next" value={returnTo} />
      <AuthField
        id="email"
        name="email"
        label="Email"
        type="email"
        autoComplete="username"
        defaultValue={state.email}
        required
      />
      <AuthField
        id="password"
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        error={state.error}
      />
      <Button
        type="submit"
        size="lg"
        className="h-12 w-full text-base"
        disabled={pending}
      >
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
