"use client";

import * as React from "react";
import Link from "next/link";
import { AuthField } from "@/components/auth/auth-field";
import { Button } from "@/components/ui/button";
import type { DeveloperFormState } from "@/app/actions/admin-developers";

/**
 * Create-a-developer-profile form. Reuses the sign-in screens' field so every
 * form in the product looks and announces errors the same way.
 */
export function DeveloperForm({
  action,
}: {
  action: (
    previous: DeveloperFormState,
    formData: FormData,
  ) => Promise<DeveloperFormState>;
}) {
  const [state, formAction, pending] = React.useActionState(action, {
    errors: {},
    values: { name: "", reraDeveloperId: "", website: "" },
  });

  return (
    <form
      action={formAction}
      className="border-border bg-card flex max-w-xl flex-col gap-6 rounded-lg border p-8"
    >
      <AuthField
        id="name"
        name="name"
        label="Developer name"
        required
        defaultValue={state.values.name}
        error={state.errors.name}
      />
      <AuthField
        id="reraDeveloperId"
        name="reraDeveloperId"
        label="RERA developer id (optional)"
        defaultValue={state.values.reraDeveloperId}
        hint="Used to recognise the same developer later. Each id can belong to one profile."
        error={state.errors.reraDeveloperId}
      />
      <AuthField
        id="website"
        name="website"
        label="Website (optional)"
        defaultValue={state.values.website}
        error={state.errors.website}
      />
      <div className="flex items-center gap-4">
        <Button
          type="submit"
          size="lg"
          className="h-11 px-6"
          disabled={pending}
        >
          {pending ? "Creating…" : "Create profile"}
        </Button>
        <Link
          href="/admin/developers"
          className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
