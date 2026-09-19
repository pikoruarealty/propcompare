"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SubmissionLookups } from "@/lib/submissions/queue";
import {
  emptyVariantForm,
  type VariantForm,
} from "@/lib/submissions/variant-form";
import { inputClass, labelClass } from "./form-classes";

const BASES = [
  { value: "carpet", label: "Carpet" },
  { value: "built_up", label: "Built-up" },
  { value: "super_built_up", label: "Super built-up" },
] as const;

/**
 * Edits the unit types (configurations) of a project: name, bedroom type,
 * layout, how many there are, and each measured area with its basis. Anything
 * left blank is simply not stated. Room dimensions read from floor plans are not
 * edited here but are kept when the value is saved.
 */
export function UnitVariantsEditor({
  value,
  onChange,
  lookups,
}: {
  value: VariantForm[];
  onChange: (next: VariantForm[]) => void;
  lookups: SubmissionLookups;
}) {
  const update = (index: number, patch: Partial<VariantForm>) =>
    onChange(value.map((v, i) => (i === index ? { ...v, ...patch } : v)));

  return (
    <div className="flex flex-col gap-4">
      {value.map((variant, index) => (
        <fieldset
          key={index}
          className="border-border bg-background flex flex-col gap-4 rounded-lg border p-4"
        >
          <legend className="font-display px-1 text-lg">
            Unit type {index + 1}
          </legend>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className={labelClass}>Name</span>
              <input
                className={inputClass}
                value={variant.variantName}
                onChange={(e) => update(index, { variantName: e.target.value })}
                placeholder="e.g. 3 BHK — Type A"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className={labelClass}>Bedrooms</span>
              <select
                className={inputClass}
                value={variant.bhkTypeKey}
                onChange={(e) => update(index, { bhkTypeKey: e.target.value })}
              >
                <option value="">Not stated</option>
                {lookups.bhkTypes.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className={labelClass}>Layout</span>
              <select
                className={inputClass}
                value={variant.layoutTypeKey}
                onChange={(e) =>
                  update(index, { layoutTypeKey: e.target.value })
                }
              >
                <option value="">Not stated</option>
                {lookups.layoutTypes.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-2">
                <span className={labelClass}>Units of this type</span>
                <input
                  className={inputClass}
                  inputMode="numeric"
                  value={variant.totalUnitsOfVariant}
                  onChange={(e) =>
                    update(index, { totalUnitsOfVariant: e.target.value })
                  }
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className={labelClass}>Per floor</span>
                <input
                  className={inputClass}
                  inputMode="numeric"
                  value={variant.unitsPerFloor}
                  onChange={(e) =>
                    update(index, { unitsPerFloor: e.target.value })
                  }
                />
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className={labelClass}>Areas (sq ft)</span>
            {variant.areas.map((area, areaIndex) => (
              <div key={areaIndex} className="flex items-center gap-2">
                <select
                  aria-label={`Area basis ${areaIndex + 1} for unit type ${index + 1}`}
                  className={`${inputClass} max-w-48`}
                  value={area.basis}
                  onChange={(e) =>
                    update(index, {
                      areas: variant.areas.map((a, i) =>
                        i === areaIndex
                          ? { ...a, basis: e.target.value as typeof a.basis }
                          : a,
                      ),
                    })
                  }
                >
                  {BASES.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={`Area ${areaIndex + 1} for unit type ${index + 1}`}
                  className={inputClass}
                  inputMode="decimal"
                  value={area.areaSqft}
                  onChange={(e) =>
                    update(index, {
                      areas: variant.areas.map((a, i) =>
                        i === areaIndex
                          ? { ...a, areaSqft: e.target.value }
                          : a,
                      ),
                    })
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove this area"
                  onClick={() =>
                    update(index, {
                      areas: variant.areas.filter((_, i) => i !== areaIndex),
                    })
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  update(index, {
                    areas: [
                      ...variant.areas,
                      { basis: "carpet", areaSqft: "" },
                    ],
                  })
                }
              >
                <Plus /> Add an area
              </Button>
            </div>
          </div>

          {variant.dimensions ? (
            <p className="text-muted-foreground text-sm">
              Room dimensions from the floor plan are kept as they are.
            </p>
          ) : null}

          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            >
              <Trash2 /> Remove this unit type
            </Button>
          </div>
        </fieldset>
      ))}

      <div>
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange([...value, emptyVariantForm()])}
        >
          <Plus /> Add a unit type
        </Button>
      </div>
    </div>
  );
}
