"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

const MAX_MESSAGE = 1000;

/**
 * "Ask about this property". An enquiry is the protected action on a dossier: it
 * needs a signed-in, phone-verified buyer (the sign-in is the OTP), and sending it
 * first records the verified unlock for this buyer and property, then the
 * enquiry. It names a unit type only if the buyer chooses one. Nothing is sent
 * twice on a retry: the message stays in the box until the send succeeds.
 */
export function EnquiryForm({
  propertyId,
  slug,
  propertyName,
  unitTypes,
}: {
  propertyId: string;
  slug: string;
  propertyName: string;
  unitTypes: { id: string; name: string }[];
}) {
  const { data: session, isPending } = authClient.useSession();
  const [unitTypeId, setUnitTypeId] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [state, setState] = React.useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = React.useState<string | null>(null);

  if (isPending) return null;

  if (!session) {
    return (
      <p className="text-sm">
        <Link
          href={`/login?next=${encodeURIComponent(`/properties/${slug}#enquiry`)}`}
          className="text-primary underline underline-offset-4"
        >
          Sign in with your mobile number
        </Link>{" "}
        to ask the developer about {propertyName}. We use the number only to
        verify you and to reach you about this enquiry.
      </p>
    );
  }

  if (state === "sent") {
    return (
      <p data-slot="enquiry-sent" role="status" className="text-sm">
        Your enquiry has been sent. We will contact you about {propertyName}.
      </p>
    );
  }

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    setState("sending");
    setError(null);
    try {
      const unlock = await fetch("/api/v1/dossier-unlocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId }),
      });
      if (unlock.status === 403) {
        throw new Error(
          "Verify your mobile number first. Sign out and sign in again with the code we text you.",
        );
      }
      const response = await fetch("/api/v1/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          ...(unitTypeId ? { unitVariantId: unitTypeId } : {}),
          ...(message.trim() ? { message: message.trim() } : {}),
        }),
      });
      if (!response.ok) throw new Error("The enquiry could not be sent.");
      setState("sent");
    } catch (failure) {
      setState("idle");
      setError(
        failure instanceof Error && failure.message
          ? `${failure.message} Your message is still here.`
          : "The enquiry could not be sent. Your message is still here.",
      );
    }
  };

  return (
    <form
      data-slot="enquiry-form"
      onSubmit={send}
      className="flex max-w-xl flex-col gap-4"
    >
      {unitTypes.length > 0 ? (
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">Unit type (optional)</span>
          <select
            value={unitTypeId}
            onChange={(event) => setUnitTypeId(event.target.value)}
            className="border-input bg-card h-11 rounded-md border px-3 text-sm"
          >
            <option value="">The whole project</option>
            {unitTypes.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted-foreground">
          Your question (optional, up to {MAX_MESSAGE} characters)
        </span>
        <textarea
          value={message}
          maxLength={MAX_MESSAGE}
          rows={4}
          onChange={(event) => setMessage(event.target.value)}
          className="border-input bg-card rounded-md border p-3 text-sm"
        />
      </label>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <div>
        <Button type="submit" size="lg" disabled={state === "sending"}>
          {state === "sending" ? "Sending…" : "Send enquiry"}
        </Button>
      </div>
    </form>
  );
}
