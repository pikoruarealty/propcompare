"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { auth } from "@/lib/auth";
import { acceptDeveloperInvite, InviteError } from "@/lib/developers/invites";

export interface AcceptInviteState {
  error: string | null;
}

const LINK_ERROR = "This link has expired or has already been used.";

/**
 * Sets the invitee's password, activates their place on the developer's team, and
 * signs them in. The token is verified inside `acceptDeveloperInvite`; nothing on
 * this form is trusted on its own.
 */
export const acceptInviteAction = async (
  _previous: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> => {
  const userId = String(formData.get("u") ?? "");
  const token = String(formData.get("t") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const name = String(formData.get("name") ?? "");

  if (password !== confirm) {
    return { error: "The two passwords do not match." };
  }

  let email: string;
  try {
    const context = await auth.$context;
    ({ email } = await acceptDeveloperInvite(db, {
      userId,
      token,
      password,
      name,
      hashPassword: (value) => context.password.hash(value),
    }));
  } catch (error) {
    if (error instanceof InviteError) {
      return {
        error: error.code === "invalid_link" ? LINK_ERROR : error.message,
      };
    }
    throw error;
  }

  // Signed in as the person who just proved they hold the link. If that fails
  // for any reason the account is still set up and they can sign in by hand.
  let destination = "/developers";
  try {
    await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });
  } catch {
    destination = "/developers/login";
  }
  redirect(destination);
};
