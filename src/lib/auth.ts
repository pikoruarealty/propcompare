import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { phoneNumber } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as authSchema from "@/db/schema/auth";

/**
 * Buyers authenticate by phone OTP; developer/admin staff use email+password.
 * SMS delivery for `sendOTP` is not wired up yet (Phase 0 scope is auth
 * plumbing, not an SMS provider integration) — logs to the console in dev
 * as a placeholder. See DECISIONS.md before picking an SMS provider.
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
    schema: authSchema,
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    // Developer and admin accounts are provisioned (an admin invite or the
    // first-admin script), never self-registered — see DECISIONS.md 2026-09-19.
    // Enforced here, not merely by leaving a sign-up screen out.
    disableSignUp: true,
  },
  plugins: [
    phoneNumber({
      // A buyer's first successful OTP creates their account: there is no
      // separate buyer sign-up screen. The placeholder email is never shown or
      // used to sign in (no credential account exists for it).
      signUpOnVerification: {
        getTempEmail: (phone) =>
          `${phone.replace(/\D/g, "")}@buyers.propcompare.invalid`,
        getTempName: () => "Buyer",
      },
      sendOTP: async ({ phoneNumber, code }) => {
        if (process.env.NODE_ENV !== "production") {
          console.log(`[dev] OTP for ${phoneNumber}: ${code}`);
          return;
        }
        throw new Error("No SMS provider configured — see DECISIONS.md");
      },
    }),
    // Must stay last in the plugins array — see Better Auth's Next.js docs.
    nextCookies(),
  ],
});
