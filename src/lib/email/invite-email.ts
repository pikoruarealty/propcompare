import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { developers, developerUsers } from "@/db/schema/catalog";
import type { EmailAdapter } from "./adapter";
import { getEmailAdapter } from "./index";

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "long" });

/**
 * Emails a one-time developer invite link. Best effort: returns whether it was
 * sent and never throws, because the admin is shown the link on screen either way.
 * Logs only the failure code, never the address or the link.
 */
export const sendDeveloperInviteEmail = async (
  database: PostgresJsDatabase,
  input: {
    developerUserId: string;
    email: string;
    inviteUrl: string;
    expiresAt: Date;
  },
  adapter: EmailAdapter | null = getEmailAdapter(),
): Promise<boolean> => {
  if (!adapter) return false;
  try {
    const [row] = await database
      .select({ name: developers.name })
      .from(developerUsers)
      .innerJoin(developers, eq(developers.id, developerUsers.developerId))
      .where(eq(developerUsers.id, input.developerUserId));
    const brand = row?.name ?? "your developer profile";
    const expires = dateFormat.format(input.expiresAt);
    const text = [
      `You have been invited to manage ${brand} on PropCompare.`,
      "",
      `Set your password and sign in: ${input.inviteUrl}`,
      "",
      `The link works once and expires on ${expires}. If you were not expecting this, you can ignore this email.`,
    ].join("\n");
    const html = `<p>You have been invited to manage <strong>${escapeHtml(brand)}</strong> on PropCompare.</p>
<p><a href="${escapeHtml(input.inviteUrl)}">Set your password and sign in</a></p>
<p>The link works once and expires on ${escapeHtml(expires)}. If you were not expecting this, you can ignore this email.</p>`;
    await adapter.send({
      to: { email: input.email },
      subject: `You're invited to manage ${brand} on PropCompare`,
      text,
      html,
    });
    return true;
  } catch (error) {
    console.error(
      "Invite email was not sent:",
      error instanceof Error ? error.name : "error",
    );
    return false;
  }
};
