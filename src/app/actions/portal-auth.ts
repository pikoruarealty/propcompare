"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { PasswordLoginState } from "@/components/auth/password-login-form";
import { auth } from "@/lib/auth";
import { safeReturnPath } from "@/lib/accounts/return-path";
import { signInToPortal } from "@/lib/accounts/sign-in";

const GENERIC_ERROR = "That email and password don't match an account here.";

const signIn = async (
  expected: "developer" | "admin",
  home: string,
  formData: FormData,
): Promise<PasswordLoginState> => {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!(await signInToPortal(expected, email, password))) {
    return { error: GENERIC_ERROR, email };
  }

  // A `next` from another portal (or outside the app) must not be honoured:
  // the destination has to stay inside the portal the person just signed in to.
  const destination = safeReturnPath(String(formData.get("next") ?? ""), home);
  redirect(destination.startsWith(home) ? destination : home);
};

export const signInDeveloper = async (
  _previous: PasswordLoginState,
  formData: FormData,
) => signIn("developer", "/developers", formData);

export const signInAdmin = async (
  _previous: PasswordLoginState,
  formData: FormData,
) => signIn("admin", "/admin", formData);

export const signOutOfPortal = async (formData: FormData) => {
  await auth.api.signOut({ headers: await headers() });
  redirect(
    formData.get("to") === "admin" ? "/admin/login" : "/developers/login",
  );
};
