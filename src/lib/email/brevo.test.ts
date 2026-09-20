import { describe, expect, it, vi } from "vitest";
import { EmailAdapterError, type EmailAdapter } from "./adapter";
import { createBrevoEmailAdapter } from "./brevo";
import { sendDeveloperInviteEmail } from "./invite-email";

const message = {
  to: { email: "dev@example.test" },
  subject: "Hello",
  text: "text",
  html: "<p>html</p>",
};

describe("the Brevo adapter", () => {
  it("posts the message to Brevo's send endpoint with the API key header", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 201 }));
    const adapter = createBrevoEmailAdapter({
      apiKey: "key-123",
      senderEmail: "hello@propcompare.test",
      senderName: "PropCompare",
      fetch: fetchMock,
    });

    await adapter.send(message);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect((init.headers as Record<string, string>)["api-key"]).toBe("key-123");
    expect(JSON.parse(String(init.body))).toEqual({
      sender: { email: "hello@propcompare.test", name: "PropCompare" },
      to: [{ email: "dev@example.test" }],
      subject: "Hello",
      textContent: "text",
      htmlContent: "<p>html</p>",
    });
  });

  it("fails with the status only, never the response body", async () => {
    const adapter = createBrevoEmailAdapter({
      apiKey: "k",
      senderEmail: "a@b.test",
      fetch: async () =>
        new Response('{"message":"dev@example.test is blocked"}', {
          status: 400,
        }),
    });
    const error = await adapter.send(message).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmailAdapterError);
    expect((error as Error).message).toBe("Brevo returned HTTP 400");
  });
});

describe("sendDeveloperInviteEmail", () => {
  it("reports not sent when no provider is configured", async () => {
    expect(
      await sendDeveloperInviteEmail(
        {} as never,
        {
          developerUserId: "x",
          email: "a@b.test",
          inviteUrl: "https://x.test/i",
          expiresAt: new Date(),
        },
        null,
      ),
    ).toBe(false);
  });

  it("never throws when the provider fails", async () => {
    const adapter: EmailAdapter = {
      send: async () => {
        throw new EmailAdapterError("provider_error", "down");
      },
    };
    const database = {
      select: () => ({
        from: () => ({
          innerJoin: () => ({ where: async () => [{ name: "Adani Realty" }] }),
        }),
      }),
    };
    expect(
      await sendDeveloperInviteEmail(
        database as never,
        {
          developerUserId: "x",
          email: "a@b.test",
          inviteUrl: "https://x.test/i",
          expiresAt: new Date(),
        },
        adapter,
      ),
    ).toBe(false);
  });

  it("sends the link and the developer's name, escaped", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const database = {
      select: () => ({
        from: () => ({
          innerJoin: () => ({ where: async () => [{ name: "A & <B>" }] }),
        }),
      }),
    };
    const sent = await sendDeveloperInviteEmail(
      database as never,
      {
        developerUserId: "x",
        email: "a@b.test",
        inviteUrl: "https://x.test/i?u=1&t=2",
        expiresAt: new Date("2026-10-01"),
      },
      { send },
    );
    expect(sent).toBe(true);
    const arg = send.mock.calls[0][0];
    expect(arg.text).toContain("https://x.test/i?u=1&t=2");
    expect(arg.html).toContain("A &amp; &lt;B&gt;");
    expect(arg.html).toContain("u=1&amp;t=2");
  });
});
