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
  },
  plugins: [
    phoneNumber({
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
