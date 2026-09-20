"use client";

import * as React from "react";
import type { SubmissionLookups } from "@/lib/submissions/queue";
import { POSSESSION_STATUS_LABEL } from "@/lib/submissions/field-display";
import { draftToValue, FieldEditor, type EditableField } from "./field-editor";
import { inputClass } from "./form-classes";

/**
 * A field you can just type into. There is no Edit button: the input is always
 * there, and what you enter is saved when you leave it (or, for a choice, as soon
 * as you pick). A small line under it says "Saving…", "Saved", or what is wrong.
 *
 * The heavy fields keep their own editors, shown open: the unit types (with their
 * areas and rooms) with a Save button, and the amenity set, which saves as boxes
 * are ticked. Everything is validated again on the server against the field
 * contract; the checks here only explain a problem before it is sent.
 */
export function InlineField({
  field,
  initial,
  lookups,
  lockedVariantNames,
  disabled,
  onSave,
}: {
  field: EditableField;
  /** The value the field holds now (a candidate, or the published value). */
  initial: unknown;
  lookups: SubmissionLookups;
  lockedVariantNames?: string[];
  disabled: boolean;
  /** Resolves to an error message, or null when saved. */
  onSave: (fieldKey: string, value: unknown) => Promise<string | null>;
}) {
  const type = field.dataType;
  const id = `field-${field.fieldKey}`;
  const held =
    initial === undefined || initial === null || Array.isArray(initial)
      ? ""
      : String(initial);
  const [text, setText] = React.useState(held);
  const [state, setState] = React.useState<
    "idle" | "saving" | "saved" | { error: string }
  >("idle");

  // Follow the saved value when it changes from outside (a RERA fetch, a refresh),
  // but never while the person is typing in this very field.
  const focused = React.useRef(false);
  React.useEffect(() => {
    if (!focused.current) setText(held);
  }, [held]);

  const save = async (raw: unknown) => {
    setState("saving");
    const message = await onSave(field.fieldKey, raw);
    setState(message ? { error: message } : "saved");
  };

  const commitText = (candidate: string) => {
    focused.current = false;
    if (candidate.trim() === held.trim()) return;
    const result = draftToValue(type, candidate);
    if (!result.ok) {
      // Clearing a field is not a save; say what to do instead of failing loudly.
      if (candidate.trim() === "") {
        setState("idle");
        setText(held);
        return;
      }
      setState({ error: result.error });
      return;
    }
    void save(result.value);
  };

  const commitChoice = (candidate: string) => {
    setText(candidate);
    if (candidate && candidate !== held) void save(candidate);
  };

  // Amenities save as boxes are ticked, shortly after the last one.
  const [picked, setPicked] = React.useState<string[]>(
    Array.isArray(initial) ? (initial as string[]) : [],
  );
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  // (The panel gives this field a new key when the saved value changes, so the
  // ticked boxes start again from it; no syncing effect is needed here.)
  React.useEffect(() => () => clearTimeout(timer.current), []);

  let control: React.ReactNode;
  if (type === "unit_variant_array") {
    return (
      <FieldEditor
        field={field}
        initial={initial}
        lookups={lookups}
        lockedVariantNames={lockedVariantNames}
        pending={disabled}
        error={typeof state === "object" ? state.error : null}
        alwaysOpen
        onSave={(value) => void save(value)}
        onCancel={() => undefined}
      />
    );
  }
  if (type === "amenity_key_array") {
    const selected = new Set(picked);
    const byCategory = new Map<string, SubmissionLookups["amenities"]>();
    for (const amenity of lookups.amenities) {
      byCategory.set(amenity.category, [
        ...(byCategory.get(amenity.category) ?? []),
        amenity,
      ]);
    }
    control = (
      <div className="flex flex-col gap-4">
        {[...byCategory.entries()].map(([category, items]) => (
          <fieldset key={category}>
            <legend className="text-muted-foreground mb-2 text-xs font-semibold tracking-[0.08em] uppercase">
              {category}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((amenity) => (
                <label
                  key={amenity.key}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-terracotta)]"
                    disabled={disabled}
                    checked={selected.has(amenity.key)}
                    onChange={() => {
                      const next = new Set(selected);
                      if (next.has(amenity.key)) next.delete(amenity.key);
                      else next.add(amenity.key);
                      const list = [...next];
                      setPicked(list);
                      clearTimeout(timer.current);
                      if (list.length === 0) {
                        setState({
                          error:
                            "Leave at least one ticked, or use Take off for amenities on a live listing.",
                        });
                        return;
                      }
                      timer.current = setTimeout(() => void save(list), 700);
                    }}
                  />
                  {amenity.label}
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
  } else if (type === "possession_status") {
    control = (
      <select
        id={id}
        className={inputClass}
        disabled={disabled}
        value={text}
        onChange={(event) => commitChoice(event.target.value)}
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
        disabled={disabled}
        value={text}
        onChange={(event) => commitChoice(event.target.value)}
      >
        <option value="" disabled>
          Choose…
        </option>
        {lookups.propertyTypes.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
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
          disabled={disabled}
          value={text}
          onChange={(event) => commitChoice(event.target.value)}
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
  } else {
    const common = {
      id,
      disabled,
      value: text,
      onFocus: () => {
        focused.current = true;
      },
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => {
        setText(event.target.value);
        if (state !== "idle") setState("idle");
      },
      onBlur: (
        event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => commitText(event.target.value),
    };
    control =
      field.fieldKey === "developer.profile_narrative" ? (
        <textarea
          {...common}
          rows={6}
          className={`${inputClass} h-auto py-3`}
        />
      ) : type === "date" ? (
        <input {...common} type="date" className={inputClass} />
      ) : type === "positive_integer" ? (
        <input {...common} inputMode="numeric" className={inputClass} />
      ) : type === "positive_number" || type === "percentage_0_to_100" ? (
        <input {...common} inputMode="decimal" className={inputClass} />
      ) : (
        <input {...common} className={inputClass} />
      );
  }

  return (
    <div>
      {control}
      <p
        aria-live="polite"
        data-slot="save-state"
        className={
          typeof state === "object"
            ? "text-destructive mt-1.5 text-sm"
            : "text-muted-foreground mt-1.5 min-h-5 text-xs"
        }
        role={typeof state === "object" ? "alert" : undefined}
      >
        {state === "saving"
          ? "Saving…"
          : state === "saved"
            ? "Saved"
            : typeof state === "object"
              ? state.error
              : type === "percentage_0_to_100"
                ? "A number from 0 to 100."
                : ""}
      </p>
    </div>
  );
}
