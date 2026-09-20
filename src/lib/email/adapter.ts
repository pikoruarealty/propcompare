/**
 * The one interface the application uses to send email, so the provider (Brevo
 * today) can change without touching a call site — the same shape as the storage
 * and OCR adapters. Nothing outside `src/lib/email/` imports a provider directly.
 */

export type EmailAdapterFailureCode = "configuration_error" | "provider_error";

export class EmailAdapterError extends Error {
  constructor(
    public readonly code: EmailAdapterFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "EmailAdapterError";
  }
}

export interface EmailMessage {
  to: { email: string; name?: string };
  subject: string;
  text: string;
  html: string;
}

export interface EmailAdapter {
  send(message: EmailMessage): Promise<void>;
}
