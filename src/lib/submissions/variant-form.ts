import type { SubmissionUnitVariant } from "./validation";

/**
 * Form state for the unit-types editor, and the conversion to and from the
 * canonical `unit_variants` value. Kept apart from the component so the rules —
 * what is required, what is dropped when blank, what is preserved untouched — are
 * tested without rendering anything.
 *
 * Whatever the editor does not show is carried through unchanged (`dimensions`,
 * which OCR fills from floor plans), so opening and saving a variant never
 * silently discards data the admin never saw.
 */

export interface VariantAreaForm {
  basis: "carpet" | "super_built_up" | "built_up" | "";
  areaSqft: string;
}

export interface VariantForm {
  variantName: string;
  bhkTypeKey: string;
  layoutTypeKey: string;
  totalUnitsOfVariant: string;
  unitsPerFloor: string;
  areas: VariantAreaForm[];
  /** Not editable here; preserved as-is. */
  dimensions?: SubmissionUnitVariant["dimensions"];
}

export const emptyVariantForm = (): VariantForm => ({
  variantName: "",
  bhkTypeKey: "",
  layoutTypeKey: "",
  totalUnitsOfVariant: "",
  unitsPerFloor: "",
  areas: [{ basis: "carpet", areaSqft: "" }],
});

const text = (n: number | undefined): string =>
  n === undefined ? "" : String(n);

export const variantsToForm = (value: unknown): VariantForm[] => {
  if (!Array.isArray(value)) return [];
  return value.map((raw): VariantForm => {
    const v = (raw ?? {}) as Partial<SubmissionUnitVariant>;
    return {
      variantName: v.variantName ?? "",
      bhkTypeKey: v.bhkTypeKey ?? "",
      layoutTypeKey: v.layoutTypeKey ?? "",
      totalUnitsOfVariant: text(v.totalUnitsOfVariant),
      unitsPerFloor: text(v.unitsPerFloor),
      areas: (v.areas ?? []).map((a) => ({
        basis: a.basis,
        areaSqft: text(a.areaSqft),
      })),
      ...(v.dimensions ? { dimensions: v.dimensions } : {}),
    };
  });
};

const parsePositiveInteger = (raw: string): number | null => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const parsePositiveNumber = (raw: string): number | null => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export type VariantsResult =
  { ok: true; value: SubmissionUnitVariant[] } | { ok: false; error: string };

export const formToVariants = (forms: VariantForm[]): VariantsResult => {
  if (forms.length === 0) {
    return { ok: false, error: "Add at least one unit type." };
  }
  const seen = new Set<string>();
  const value: SubmissionUnitVariant[] = [];

  for (const [index, form] of forms.entries()) {
    const label = `Unit type ${index + 1}`;
    const name = form.variantName.trim();
    if (!name) return { ok: false, error: `${label} needs a name.` };
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) {
      return {
        ok: false,
        error: `“${name}” is used twice. Names must be unique.`,
      };
    }
    seen.add(key);

    const variant: SubmissionUnitVariant = { variantName: name };
    if (form.bhkTypeKey) variant.bhkTypeKey = form.bhkTypeKey;
    if (form.layoutTypeKey) variant.layoutTypeKey = form.layoutTypeKey;

    if (form.totalUnitsOfVariant.trim()) {
      const n = parsePositiveInteger(form.totalUnitsOfVariant);
      if (n === null) {
        return {
          ok: false,
          error: `${name}: total units must be a whole number above zero.`,
        };
      }
      variant.totalUnitsOfVariant = n;
    }
    if (form.unitsPerFloor.trim()) {
      const n = parsePositiveInteger(form.unitsPerFloor);
      if (n === null) {
        return {
          ok: false,
          error: `${name}: units per floor must be a whole number above zero.`,
        };
      }
      variant.unitsPerFloor = n;
    }

    const areas: NonNullable<SubmissionUnitVariant["areas"]> = [];
    const bases = new Set<string>();
    for (const row of form.areas) {
      const blank = !row.areaSqft.trim();
      if (blank) continue; // an untouched row is simply not stated
      if (!row.basis)
        return { ok: false, error: `${name}: choose what each area measures.` };
      const area = parsePositiveNumber(row.areaSqft);
      if (area === null) {
        return {
          ok: false,
          error: `${name}: areas must be a number above zero.`,
        };
      }
      if (bases.has(row.basis)) {
        return {
          ok: false,
          error: `${name}: each area basis can appear once.`,
        };
      }
      bases.add(row.basis);
      areas.push({ basis: row.basis, areaSqft: area });
    }
    if (areas.length > 0) variant.areas = areas;
    if (form.dimensions) variant.dimensions = form.dimensions;

    value.push(variant);
  }
  return { ok: true, value };
};
