"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import type { SubmissionLookups } from "@/lib/submissions/queue";
import { POSSESSION_STATUS_LABEL } from "@/lib/submissions/field-display";
import {
  emptyVariantForm,
  formToVariants,
  variantsToForm,
  type VariantForm,
} from "@/lib/submissions/variant-form";
import { inputClass, labelClass } from "./form-classes";
import { UnitVariantsEditor } from "./unit-variants-editor";

export interface EditableField {
  fieldKey: string;
  label: string;
  dataType: string;
}

type Draft = string | string[] | VariantForm[];

const initialDraft = (dataType: string, initial: unknown): Draft => {
  if (dataType === "amenity_key_array") {
    return Array.isArray(initial) ? (initial as string[]) : [];
  }
  if (dataType === "unit_variant_array") {
    const forms = variantsToForm(initial);
    return forms.length > 0 ? forms : [emptyVariantForm()];
  }
  return initial === undefined || initial === null ? "" : String(initial);
};

/** Converts what was typed into the canonical value, or explains what is wrong. */
export const draftToValue = (
  dataType: string,
  draft: Draft,
): { ok: true; value: unknown } | { ok: false; error: string } => {
  if (dataType === "amenity_key_array") {
    const keys = draft as string[];
    return keys.length === 0
      ? {
          ok: false,
          error: "Select at least one amenity, or leave this not stated.",
        }
      : { ok: true, value: keys };
  }
  if (dataType === "unit_variant_array") {
    return formToVariants(draft as VariantForm[]);
  }
  const text = (draft as string).trim();
  if (!text)
    return {
      ok: false,
      error: "Enter a value, or cancel to leave it not stated.",
    };
  if (
    dataType === "positive_integer" ||
    dataType === "positive_number" ||
    dataType === "percentage_0_to_100"
  ) {
    const n = Number(text);
    if (!Number.isFinite(n)) return { ok: false, error: "Enter a number." };
    return { ok: true, value: n };
  }
  return { ok: true, value: text };
};

/**
 * A typed input for one contract field: text, a whole number, a percentage, a
 * date, a choice from an approved list, a set of amenities, or the unit-types
 * editor. The server re-validates everything against the field contract; this
 * exists so the admin picks from real options instead of typing JSON.
 */
export function FieldEditor({
  field,
  initial,
  lookups,
  pending,
  error,
  onSave,
  onCancel,
}: {
  field: EditableField;
  initial: unknown;
  lookups: SubmissionLookups;
  pending: boolean;
  error: string | null;
  onSave: (value: unknown) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = React.useState<Draft>(() =>
    initialDraft(field.dataType, initial),
  );
  const [localError, setLocalError] = React.useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const result = draftToValue(field.dataType, draft);
    if (!result.ok) {
      setLocalError(result.error);
      return;
    }
    setLocalError(null);
    onSave(result.value);
  };

  const id = `field-${field.fieldKey}`;
  const shownError = localError ?? error;
  const type = field.dataType;
  const text = typeof draft === "string" ? draft : "";

  let control: React.ReactNode;
  if (type === "amenity_key_array") {
    const selected = new Set(draft as string[]);
    const byCategory = new Map<string, SubmissionLookups["amenities"]>();
    for (const a of lookups.amenities) {
      byCategory.set(a.category, [...(byCategory.get(a.category) ?? []), a]);
    }
    control = (
      <div className="flex flex-col gap-4">
        {[...byCategory.entries()].map(([category, items]) => (
          <fieldset key={category}>
            <legend className={`${labelClass} mb-2`}>{category}</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((a) => (
                <label
                  key={a.key}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-terracotta)]"
                    checked={selected.has(a.key)}
                    onChange={() => {
                      const next = new Set(selected);
                      if (next.has(a.key)) next.delete(a.key);
                      else next.add(a.key);
                      setDraft([...next]);
                    }}
                  />
                  {a.label}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <p className="text-muted-foreground text-sm">
          {selected.size} selected
        </p>
      </div>
    );
  } else if (type === "unit_variant_array") {
    control = (
      <UnitVariantsEditor
        value={draft as VariantForm[]}
        onChange={setDraft}
        lookups={lookups}
      />
    );
  } else if (type === "possession_status") {
    control = (
      <select
        id={id}
        className={inputClass}
        value={text}
        onChange={(e) => setDraft(e.target.value)}
      >
        <option value="" disabled>
          Choose…
        </option>
        {Object.entries(POSSESSION_STATUS_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    );
  } else if (type === "property_type_key") {
    control = (
      <select
        id={id}
        className={inputClass}
        value={text}
        onChange={(e) => setDraft(e.target.value)}
      >
        <option value="" disabled>
          Choose…
        </option>
        {lookups.propertyTypes.map((t) => (
          <option key={t.key} value={t.key}>
            {t.label}
          </option>
        ))}
      </select>
    );
  } else if (type === "legal_entity_id") {
    control =
      lookups.legalEntities.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No legal entities are recorded for this developer yet. Add one on the
          developer profile, then come back.
        </p>
      ) : (
        <select
          id={id}
          className={inputClass}
          value={text}
          onChange={(e) => setDraft(e.target.value)}
        >
          <option value="" disabled>
            Choose…
          </option>
          {lookups.legalEntities.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.label}
            </option>
          ))}
        </select>
      );
  } else if (type === "date") {
    control = (
      <input
        id={id}
        type="date"
        className={inputClass}
        value={text}
        onChange={(e) => setDraft(e.target.value)}
      />
    );
  } else if (type === "positive_integer") {
    control = (
      <input
        id={id}
        inputMode="numeric"
        className={inputClass}
        value={text}
        onChange={(e) => setDraft(e.target.value)}
      />
    );
  } else if (type === "positive_number" || type === "percentage_0_to_100") {
    control = (
      <input
        id={id}
        inputMode="decimal"
        className={inputClass}
        value={text}
        onChange={(e) => setDraft(e.target.value)}
        aria-describedby={
          type === "percentage_0_to_100" ? `${id}-hint` : undefined
        }
      />
    );
  } else if (field.fieldKey === "developer.profile_narrative") {
    control = (
      <textarea
        id={id}
        rows={6}
        className={`${inputClass} h-auto py-3`}
        value={text}
        onChange={(e) => setDraft(e.target.value)}
      />
    );
  } else {
    control = (
      <input
        id={id}
        className={inputClass}
        value={text}
        onChange={(e) => setDraft(e.target.value)}
      />
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {type === "amenity_key_array" || type === "unit_variant_array" ? (
        <p className={labelClass}>{field.label}</p>
      ) : (
        <label htmlFor={id} className={labelClass}>
          {field.label}
        </label>
      )}
      {control}
      {type === "percentage_0_to_100" ? (
        <p id={`${id}-hint`} className="text-muted-foreground text-sm">
          A number from 0 to 100.
        </p>
      ) : null}
      {shownError ? (
        <p role="alert" className="text-destructive text-sm">
          {shownError}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
