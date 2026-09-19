import { createLocalAccountIssuer } from "@better-auth/core/db";
import { auth } from "@/lib/auth";

/**
 * Creates a user with an email + password credential, bypassing the public
 * sign-up endpoint that `src/lib/auth.ts` disables on purpose. This is the only
 * sanctioned way to make a password account: the first-admin script and, later,
 * the admin's developer-invite flow both go through it, so an account can never
 * come into being just because someone found an open endpoint.
 *
 * It writes identity only (`users` + `accounts`). Granting a role is a separate
 * `admin_users` / `developer_users` row, and none of this touches a live
 * catalog table.
 */
export const provisionPasswordAccount = async (input: {
  email: string;
  password: string;
  name: string;
}): Promise<{ userId: string }> => {
  const context = await auth.$context;
  const email = input.email.trim().toLowerCase();

  const existing = await context.internalAdapter.findUserByEmail(email, {
    includeAccounts: false,
  });
  if (existing) throw new Error(`An account already exists for ${email}`);

  const passwordHash = await context.password.hash(input.password);
  const user = await context.internalAdapter.createUser(
    {
      email,
      name: input.name,
      emailVerified: true,
    },
    { method: "admin" },
  );
  await context.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    issuer: createLocalAccountIssuer("credential"),
    accountId: user.id,
    password: passwordHash,
  });
  return { userId: user.id };
};
