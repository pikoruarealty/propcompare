"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/admin/submission/confirm-action";
import {
  inputClass,
  labelClass,
} from "@/components/admin/submission/form-classes";
import { cn } from "@/lib/utils";

export interface TeamMemberView {
  developerUserId: string;
  email: string;
  name: string;
  title: string | null;
  status: "invited" | "active" | "revoked";
  invitedAt: string;
  inviteExpiresAt: string | null;
}

interface IssuedLink {
  email: string;
  inviteUrl: string;
  expiresAt: string;
  /** Whether the link was also emailed (only when an email provider is configured). */
  emailed?: boolean;
}

const date = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });

const STATUS: Record<
  TeamMemberView["status"],
  { label: string; tone: string }
> = {
  invited: { label: "Invited", tone: "bg-accent text-accent-foreground" },
  active: {
    label: "Active",
    tone: "border-border border bg-card text-foreground",
  },
  revoked: {
    label: "Removed",
    tone: "bg-[color-mix(in_oklab,var(--destructive)_12%,var(--color-chalk))] text-destructive",
  },
};

/**
 * The people who can sign in for a developer profile. An owner can invite by
 * email, get a fresh link for someone still pending, and remove anyone's access.
 * There is no email service yet, so an invitation's link is shown here once for the
 * admin to pass on; it is never stored in readable form and cannot be shown again.
 */
export function TeamPanel({
  developerId,
  developerName,
  members,
  isOwner,
}: {
  developerId: string;
  developerName: string;
  members: TeamMemberView[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [link, setLink] = React.useState<IssuedLink | null>(null);
  const [copied, setCopied] = React.useState(false);

  const call = async (url: string, init: RequestInit) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, init);
      if (response.status === 204) return { ok: true as const, body: null };
      const body = (await response.json().catch(() => null)) as
        | (IssuedLink & { error?: never })
        | { error?: { message?: string } }
        | null;
      if (!response.ok) {
        setError(
          (body && "error" in body && body.error?.message) ||
            "That could not be done.",
        );
        return { ok: false as const, body: null };
      }
      return { ok: true as const, body: body as IssuedLink };
    } catch {
      setError("Could not reach the server. Check your connection.");
      return { ok: false as const, body: null };
    } finally {
      setBusy(false);
    }
  };

  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return setError("Enter the person's email address.");
    const result = await call(
      `/api/v1/admin/developers/${developerId}/invites`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, title }),
      },
    );
    if (result.ok && result.body) {
      setLink(result.body);
      setCopied(false);
      setEmail("");
      setTitle("");
      router.refresh();
    }
  };

  const reissue = async (id: string) => {
    const result = await call(`/api/v1/admin/developer-users/${id}/reissue`, {
      method: "POST",
    });
    if (result.ok && result.body) {
      setLink(result.body);
      setCopied(false);
      router.refresh();
    }
  };

  const remove = async (id: string) => {
    const result = await call(`/api/v1/admin/developer-users/${id}`, {
      method: "DELETE",
    });
    if (result.ok) router.refresh();
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.inviteUrl);
      setCopied(true);
    } catch {
      setError("Could not copy automatically. Select the link and copy it.");
    }
  };

  return (
    <section aria-labelledby="team-heading" className="mt-10">
      <h2 id="team-heading" className="font-display text-2xl">
        Team
      </h2>
      <p className="text-muted-foreground mt-1 mb-4 max-w-prose text-sm">
        People who can sign in to manage {developerName}&apos;s listings. They
        join this same profile, so everything already uploaded stays theirs to
        see.
      </p>

      {link ? (
        <div
          role="status"
          className="border-primary/40 bg-card mb-6 rounded-lg border p-5"
        >
          <p className="font-display text-xl">
            Invitation ready for {link.email}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {link.emailed
              ? "We emailed this link to them. You can also send it yourself. "
              : "Send them this link. "}
            It works once, expires on {date.format(new Date(link.expiresAt))},
            and <strong>cannot be shown again</strong> — if it is lost, issue a
            new one.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              aria-label="Invitation link"
              value={link.inviteUrl}
              onFocus={(e) => e.currentTarget.select()}
              className={cn(inputClass, "font-mono text-sm")}
            />
            <Button type="button" onClick={copy}>
              {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy link"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setLink(null)}>
              Done
            </Button>
          </div>
        </div>
      ) : null}

      {members.length === 0 ? (
        <p className="border-border bg-card text-muted-foreground rounded-lg border p-6 text-sm">
          Nobody has been invited yet.
        </p>
      ) : (
        <div className="border-border bg-card overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-border bg-muted/50 text-muted-foreground border-b text-xs font-semibold tracking-[0.1em] uppercase">
                <th scope="col" className="px-6 py-4">
                  Person
                </th>
                <th scope="col" className="px-6 py-4">
                  Status
                </th>
                <th scope="col" className="px-6 py-4">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr
                  key={m.developerUserId}
                  className="border-border border-b last:border-b-0"
                >
                  <td className="px-6 py-4">
                    <p className="font-medium">{m.name}</p>
                    <p className="text-muted-foreground">
                      {m.email}
                      {m.title ? ` · ${m.title}` : ""}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-semibold tracking-[0.06em] uppercase",
                        STATUS[m.status].tone,
                      )}
                    >
                      {STATUS[m.status].label}
                    </span>
                    {m.status === "invited" && m.inviteExpiresAt ? (
                      <p className="text-muted-foreground mt-1 text-xs">
                        Link expires {date.format(new Date(m.inviteExpiresAt))}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-6 py-4">
                    {isOwner && m.status !== "revoked" ? (
                      <div className="flex flex-wrap justify-end gap-2">
                        {m.status === "invited" ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => reissue(m.developerUserId)}
                          >
                            New link
                          </Button>
                        ) : null}
                        <ConfirmAction
                          label={
                            m.status === "invited"
                              ? "Withdraw"
                              : "Remove access"
                          }
                          variant="outline"
                          title={
                            m.status === "invited"
                              ? "Withdraw this invitation?"
                              : "Remove this person's access?"
                          }
                          description={
                            m.status === "invited"
                              ? "Their link will stop working."
                              : "They will be signed out straight away and can no longer manage this developer's listings."
                          }
                          confirmLabel={
                            m.status === "invited" ? "Withdraw" : "Remove"
                          }
                          disabled={busy}
                          onConfirm={() => remove(m.developerUserId)}
                        />
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isOwner ? (
        <form
          onSubmit={invite}
          className="border-border bg-card mt-6 flex flex-col gap-4 rounded-lg border p-5"
          noValidate
        >
          <p className="font-display text-xl">Invite someone</p>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className={labelClass}>Email</span>
              <input
                type="email"
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className={labelClass}>Their role (optional)</span>
              <input
                className={inputClass}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Sales head"
              />
            </label>
          </div>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <div>
            <Button type="submit" disabled={busy}>
              {busy ? "Working…" : "Create invitation"}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-muted-foreground mt-4 text-sm">
          Only an owner can invite or remove people.
        </p>
      )}
    </section>
  );
}
