import { getEmailAdapter } from "@/lib/email";

/**
 * One-off check that the configured email provider really delivers:
 *   TEST_EMAIL_TO=you@example.com bun run src/db/send-test-email.ts
 */
const to = process.env.TEST_EMAIL_TO;
if (!to) throw new Error("Set TEST_EMAIL_TO to the address to send to.");
const adapter = getEmailAdapter();
if (!adapter)
  throw new Error("BREVO_API_KEY / BREVO_SENDER_EMAIL are not set.");

await adapter.send({
  to: { email: to },
  subject: "PropCompare test email",
  text: "This is a test message from PropCompare to confirm email delivery works. Nothing to do.",
  html: "<p>This is a test message from PropCompare to confirm email delivery works. Nothing to do.</p>",
});
console.info("Brevo accepted the message.");
