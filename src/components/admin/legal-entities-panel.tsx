"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  LEGAL_ENTITY_TYPE_LABEL,
  LEGAL_ENTITY_TYPES,
  type LegalEntityType,
} from "@/lib/developers/legal-entity-types";
import {
  inputClass,
  labelClass,
} from "@/components/admin/submission/form-classes";

export interface LegalEntityView {
  id: string;
  legalName: string;
  entityType: LegalEntityType;
  reraPromoterRegistrationNumber: string | null;
  properties: number;
}

interface FormState {
  legalName: string;
  entityType: LegalEntityType | "";
  rera: string;
}

const EMPTY: FormState = { legalName: "", entityType: "", rera: "" };

/**
 * The legal entities RERA registers this developer's projects under. A property
 * is linked to one of them while its submission is reconciled. Any admin can add
 * or correct one; the registration number may belong to one entity only.
 */
export function LegalEntitiesPanel({
  developerId,
  entities,
}: {
  developerId: string;
  entities: LegalEntityView[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<FormState>(EMPTY);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const startEdit = (entity: LegalEntityView) => {
    setEditingId(entity.id);
    setError(null);
    setForm({
      legalName: entity.legalName,
      entityType: entity.entityType,
      rera: entity.reraPromoterRegistrationNumber ?? "",
    });
  };

  const reset = () => {
    setEditingId(null);
    setForm(EMPTY);
    setError(null);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.legalName.trim()) return setError("Enter the legal name.");
    if (!form.entityType) return setError("Choose the type of entity.");
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        editingId
          ? `/api/v1/admin/legal-entities/${editingId}`
          : `/api/v1/admin/developers/${developerId}/legal-entities`,
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            legalName: form.legalName,
            entityType: form.entityType,
            reraPromoterRegistrationNumber: form.rera,
          }),
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        return setError(payload?.error?.message ?? "That could not be saved.");
      }
      reset();
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="legal-entities-heading" className="mt-10">
      <h2 id="legal-entities-heading" className="font-display text-2xl">
        Legal entities
      </h2>
      <p className="text-muted-foreground mt-1 mb-4 max-w-prose text-sm">
        The companies this developer&apos;s projects are registered under with
        RERA. Choose one for each property while reviewing its details. Buyers
        do not see these yet.
      </p>

      {entities.length === 0 ? (
        <p className="text-muted-foreground mb-4 text-sm">
          No legal entities recorded yet.
        </p>
      ) : (
        <ul className="border-border bg-card divide-border mb-6 divide-y rounded-lg border">
          {entities.map((entity) => (
            <li
              key={entity.id}
              className="flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div>
                <p className="font-medium">{entity.legalName}</p>
                <p className="text-muted-foreground text-sm">
                  {LEGAL_ENTITY_TYPE_LABEL[entity.entityType]} · RERA promoter
                  no.{" "}
                  <span className="data-tabular">
                    {entity.reraPromoterRegistrationNumber ?? "not recorded"}
                  </span>{" "}
                  · {entity.properties}{" "}
                  {entity.properties === 1 ? "property" : "properties"}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => startEdit(entity)}
              >
                Edit
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={save}
        className="border-border bg-card grid max-w-2xl gap-4 rounded-lg border p-6 sm:grid-cols-2"
      >
        <p className="font-display text-lg sm:col-span-2">
          {editingId ? "Edit legal entity" : "Add a legal entity"}
        </p>
        <div className="sm:col-span-2">
          <label htmlFor="entity-name" className={labelClass}>
            Legal name
          </label>
          <input
            id="entity-name"
            className={`${inputClass} mt-2`}
            value={form.legalName}
            onChange={(e) => setForm({ ...form, legalName: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="entity-type" className={labelClass}>
            Type
          </label>
          <select
            id="entity-type"
            className={`${inputClass} mt-2`}
            value={form.entityType}
            onChange={(e) =>
              setForm({
                ...form,
                entityType: e.target.value as LegalEntityType,
              })
            }
          >
            <option value="" disabled>
              Choose…
            </option>
            {LEGAL_ENTITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {LEGAL_ENTITY_TYPE_LABEL[type]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="entity-rera" className={labelClass}>
            RERA promoter number (optional)
          </label>
          <input
            id="entity-rera"
            className={`${inputClass} mt-2`}
            value={form.rera}
            onChange={(e) => setForm({ ...form, rera: e.target.value })}
          />
        </div>
        {error ? (
          <p role="alert" className="text-destructive text-sm sm:col-span-2">
            {error}
          </p>
        ) : null}
        <div className="flex gap-3 sm:col-span-2">
          <Button type="submit" disabled={busy}>
            {editingId ? "Save changes" : "Add legal entity"}
          </Button>
          {editingId ? (
            <Button type="button" variant="ghost" onClick={reset}>
              Cancel
            </Button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
