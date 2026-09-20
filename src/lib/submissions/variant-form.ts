import type {
  SubmissionRoomDimension,
  SubmissionUnitVariant,
} from "./validation";

/**
 * Form state for the unit-types editor, and the conversion to and from the
 * canonical `unit_variants` value. Kept apart from the component so the rules —
 * what is required, what is dropped when blank, what is preserved untouched — are
 * tested without rendering anything.
 *
 * Room dimensions (read from floor plans by OCR, or entered by hand) are edited
 * like everything else: rooms, balconies and a foyer, each with a name and any of
 * length, width and area. Nothing is dropped unseen: the editor shows every room,
 * and saving writes exactly what it shows.
 */

export interface RoomForm {
  name: string;
  lengthFt: string;
  widthFt: string;
  areaSqft: string;
}

export const emptyRoomForm = (): RoomForm => ({
  name: "",
  lengthFt: "",
  widthFt: "",
  areaSqft: "",
});

const roomToForm = (room: SubmissionRoomDimension): RoomForm => ({
  name: room.name ?? "",
  lengthFt: text(room.lengthFt),
  widthFt: text(room.widthFt),
  areaSqft: text(room.areaSqft),
});

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
  rooms: RoomForm[];
  balconies: RoomForm[];
  /** The foyer, when the floor plan has one; `null` when it has none. */
  foyer: RoomForm | null;
}

export const emptyVariantForm = (): VariantForm => ({
  variantName: "",
  bhkTypeKey: "",
  layoutTypeKey: "",
  totalUnitsOfVariant: "",
  unitsPerFloor: "",
  areas: [{ basis: "carpet", areaSqft: "" }],
  rooms: [],
  balconies: [],
  foyer: null,
});

function text(n: number | undefined): string {
  return n === undefined ? "" : String(n);
}

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
      rooms: (v.dimensions?.rooms ?? []).map(roomToForm),
      balconies: (v.dimensions?.balconies ?? []).map(roomToForm),
      foyer: v.dimensions?.foyer ? roomToForm(v.dimensions.foyer) : null,
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

const blankRoom = (room: RoomForm): boolean =>
  !room.name.trim() &&
  !room.lengthFt.trim() &&
  !room.widthFt.trim() &&
  !room.areaSqft.trim();

/** One room row to its canonical form, or an error in plain words. A wholly blank
 * row is simply not there. */
const readRoomForm = (
  room: RoomForm,
  where: string,
):
  | { ok: true; value: SubmissionRoomDimension | null }
  | { ok: false; error: string } => {
  if (blankRoom(room)) return { ok: true, value: null };
  const name = room.name.trim();
  if (!name) return { ok: false, error: `${where}: give each room a name.` };
  const value: SubmissionRoomDimension = { name };
  for (const [key, label] of [
    ["lengthFt", "length"],
    ["widthFt", "width"],
    ["areaSqft", "area"],
  ] as const) {
    if (!room[key].trim()) continue;
    const n = parsePositiveNumber(room[key]);
    if (n === null) {
      return {
        ok: false,
        error: `${where}: the ${label} of ${name} must be a number above zero.`,
      };
    }
    value[key] = n;
  }
  if (
    value.lengthFt === undefined &&
    value.widthFt === undefined &&
    value.areaSqft === undefined
  ) {
    return {
      ok: false,
      error: `${where}: ${name} needs a length and width, or an area.`,
    };
  }
  return { ok: true, value };
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
    const dimensions: NonNullable<SubmissionUnitVariant["dimensions"]> = {};
    for (const [key, list] of [
      ["rooms", form.rooms],
      ["balconies", form.balconies],
    ] as const) {
      const read: SubmissionRoomDimension[] = [];
      for (const room of list) {
        const result = readRoomForm(room, name);
        if (!result.ok) return result;
        if (result.value) read.push(result.value);
      }
      if (read.length > 0) dimensions[key] = read;
    }
    if (form.foyer) {
      const result = readRoomForm(form.foyer, name);
      if (!result.ok) return result;
      if (result.value) dimensions.foyer = result.value;
    }
    if (Object.keys(dimensions).length > 0) variant.dimensions = dimensions;

    value.push(variant);
  }
  return { ok: true, value };
};
