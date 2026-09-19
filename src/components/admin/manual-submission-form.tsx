"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ManualSubmissionForm({
  developers,
}: {
  developers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [developerId, setDeveloperId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const create = () => {
    if (!developerId) {
      setError("Choose the developer this property belongs to.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/v1/admin/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ developerId }),
      });
      const payload = (await response.json().catch(() => null)) as
        { submissionId: string } | { error: { message: string } } | null;
      if (!response.ok || !payload || !("submissionId" in payload)) {
        setError(
          payload && "error" in payload
            ? payload.error.message
            : "The manual draft could not be created.",
        );
        return;
      }
      router.push(`/admin/submissions/${payload.submissionId}`);
    });
  };

  return (
    <form
      className="border-border bg-card max-w-xl rounded-lg border p-6"
      onSubmit={(event) => {
        event.preventDefault();
        create();
      }}
    >
      <label className="block text-sm font-semibold" htmlFor="developer">
        Developer profile
      </label>
      <select
        id="developer"
        className="border-input bg-background mt-2 h-11 w-full rounded-md border px-3 text-sm"
        value={developerId}
        onChange={(event) => setDeveloperId(event.target.value)}
      >
        <option value="">Select a developer</option>
        {developers.map((developer) => (
          <option key={developer.id} value={developer.id}>
            {developer.name}
          </option>
        ))}
      </select>
      <p className="text-muted-foreground mt-3 text-sm">
        This opens the same reconciliation draft as a brochure, with every
        missing field clearly marked Not stated until you enter it.
      </p>
      {error ? <p className="text-destructive mt-3 text-sm">{error}</p> : null}
      <Button type="submit" className="mt-5" disabled={pending}>
        {pending ? "Creating draft…" : "Start manual entry"}
      </Button>
    </form>
  );
}
