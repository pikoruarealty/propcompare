import type { EmailAdapter } from "./adapter";
import { createBrevoEmailAdapter } from "./brevo";

/**
 * The configured email adapter, or `null` when no provider is configured (local
 * development without keys). Callers treat email as best-effort: a screen that
 * needs the result (such as the invite link) must still work without it.
 */
export const getEmailAdapter = (): EmailAdapter | null => {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !senderEmail) return null;
  return createBrevoEmailAdapter({
    apiKey,
    senderEmail,
    senderName: process.env.BREVO_SENDER_NAME || undefined,
  });
};
