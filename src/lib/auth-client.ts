"use client";

import { createAuthClient } from "better-auth/react";
import { phoneNumberClient } from "better-auth/client/plugins";

/**
 * Browser-side Better Auth client. Only the buyer flows use it directly (phone
 * OTP and the header's session indicator); the developer and admin portals sign
 * in through server actions so their role can be checked before a session
 * exists (`src/lib/accounts/sign-in.ts`).
 */
export const authClient = createAuthClient({
  plugins: [phoneNumberClient()],
});
