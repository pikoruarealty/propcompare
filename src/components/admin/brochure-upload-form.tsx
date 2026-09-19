"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const MAX_MB = 100;

/**
 * Uploads a brochure PDF for one developer to `POST /api/v1/admin/source-documents`
 * and, on success, moves straight to the page-review screen for the new draft.
 * The client checks type and size only to save a slow round trip; the server
 * re-validates everything (the file is only trusted once it has been opened as a
 * real PDF).
 */
export function BrochureUploadForm({
  developers,
}: {
  developers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [developerId, setDeveloperId] = React.useState(developers[0]?.id ?? "");
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!developerId)
      return setError("Choose the developer this brochure belongs to.");
    if (!file) return setError("Choose a PDF brochure to upload.");
    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      return setError("That file is not a PDF.");
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      return setError(`That file is larger than ${MAX_MB} MB.`);
    }

    setPending(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("developerId", developerId);
      body.set("file", file);
      const response = await fetch("/api/v1/admin/source-documents", {
        method: "POST",
        body,
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(
          payload?.error?.message ?? "The upload failed. Please try again.",
        );
        return;
      }
      const created = (await response.json()) as { submissionId: string };
      router.push(`/admin/submissions/${created.submissionId}/pages`);
    } catch {
      setError("The upload failed. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  };

  if (developers.length === 0) {
    return (
      <div className="border-border bg-card max-w-xl rounded-lg border p-8">
        <p className="font-display text-2xl">Add the developer first</p>
        <p className="text-muted-foreground mt-2 text-sm">
          Every brochure belongs to a developer profile. Create one, then come
          back.
        </p>
        <Button asChild size="lg" className="mt-6 h-11 px-6">
          <Link href="/admin/developers/new">Add developer</Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="border-border bg-card flex max-w-xl flex-col gap-6 rounded-lg border p-8"
    >
      <div className="flex flex-col gap-2">
        <label
          htmlFor="developer"
          className="text-muted-foreground text-xs font-semibold tracking-[0.1em] uppercase"
        >
          Developer
        </label>
        <select
          id="developer"
          value={developerId}
          onChange={(event) => setDeveloperId(event.target.value)}
          className="border-input bg-card focus:border-ring h-12 rounded-md border px-3 text-base outline-none"
        >
          {developers.map((developer) => (
            <option key={developer.id} value={developer.id}>
              {developer.name}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-sm">
          The developer does not need an account. Not listed?{" "}
          <Link
            href="/admin/developers/new"
            className="underline underline-offset-4"
          >
            Add them
          </Link>
          .
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="brochure"
          className="text-muted-foreground text-xs font-semibold tracking-[0.1em] uppercase"
        >
          Brochure (PDF)
        </label>
        <input
          id="brochure"
          type="file"
          accept="application/pdf,.pdf"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "brochure-error" : undefined}
          className="border-input bg-card file:bg-muted file:text-foreground rounded-md border p-2 text-sm file:mr-4 file:rounded-md file:border-0 file:px-4 file:py-2 file:text-sm"
        />
        {error ? (
          <p
            id="brochure-error"
            role="alert"
            className="text-destructive text-sm"
          >
            {error}
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            Up to {MAX_MB} MB. Nothing is read by OCR yet — you will confirm
            which pages matter first.
          </p>
        )}
      </div>

      <div className="flex items-center gap-4">
        <Button
          type="submit"
          size="lg"
          className="h-11 px-6"
          disabled={pending}
        >
          {pending ? "Uploading…" : "Upload brochure"}
        </Button>
        <Link
          href="/admin/submissions"
          className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
