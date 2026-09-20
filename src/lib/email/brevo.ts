import {
  EmailAdapterError,
  type EmailAdapter,
  type EmailMessage,
} from "./adapter";

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";

export interface BrevoOptions {
  apiKey: string;
  senderEmail: string;
  senderName?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** Sends transactional email through Brevo's REST API (`POST /v3/smtp/email`). */
export const createBrevoEmailAdapter = (
  options: BrevoOptions,
): EmailAdapter => {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  return {
    async send(message: EmailMessage): Promise<void> {
      let response: Response;
      try {
        response = await fetchImplementation(BREVO_SEND_URL, {
          method: "POST",
          headers: {
            "api-key": options.apiKey,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            sender: {
              email: options.senderEmail,
              ...(options.senderName ? { name: options.senderName } : {}),
            },
            to: [message.to],
            subject: message.subject,
            textContent: message.text,
            htmlContent: message.html,
          }),
          signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
        });
      } catch (error) {
        throw new EmailAdapterError(
          "provider_error",
          `Brevo request failed: ${error instanceof Error ? error.name : "error"}`,
        );
      }
      if (!response.ok) {
        // The body can echo the recipient; keep only the status in the message.
        throw new EmailAdapterError(
          "provider_error",
          `Brevo returned HTTP ${response.status}`,
        );
      }
    },
  };
};
