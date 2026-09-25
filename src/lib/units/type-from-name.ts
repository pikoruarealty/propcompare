/**
 * A unit type's bedroom and layout keys, read from the words its own name prints.
 *
 * The extraction prompt only lets the model set a bedroom type when a plan's heading
 * prints the configuration, and never a layout, so that nothing is inferred from a
 * drawing (a rule bought with a paid run). That left "4 BHK Duplex (Lower + Upper
 * Floor Plan)" with both blank. This reads what the name itself says, in code, with no
 * model involved: it never counts rooms and never guesses. A name that prints
 * neither ("Type A", "Premium - Unit 03", "Typical Floor Plan") gives nothing, and
 * the field stays "Not stated".
 *
 * The keys are the seeded `bhk_types` and `layout_types` vocabularies.
 */
export interface UnitTypeKeys {
  bhkTypeKey?: string;
  layoutTypeKey?: string;
}

/** "3 BHK", "3BHK", "5 BHLK" (a printed spelling of BHK) or "Studio". */
const BEDROOMS = /\b(\d{1,2})\s*-?\s*(?:BHK|BHLK)\b/i;

const bhkKey = (bedrooms: number): string | undefined =>
  bedrooms >= 1 && bedrooms <= 4
    ? `${bedrooms}bhk`
    : bedrooms >= 5
      ? "5bhk_plus"
      : undefined;

/** A layout word as a whole word; the first one printed wins. */
const LAYOUTS: [RegExp, string][] = [
  [/\bpenthouse\b/i, "penthouse"],
  [/\bduplex\b/i, "duplex"],
  [/\bsimplex\b/i, "simplex"],
];

export const unitTypeKeysFromName = (name: string): UnitTypeKeys => {
  const keys: UnitTypeKeys = {};

  const bedrooms = BEDROOMS.exec(name);
  if (bedrooms) {
    const key = bhkKey(Number(bedrooms[1]));
    if (key) keys.bhkTypeKey = key;
  } else if (/\bstudio\b/i.test(name)) {
    keys.bhkTypeKey = "studio";
  }

  let earliest = Infinity;
  for (const [pattern, key] of LAYOUTS) {
    const at = name.search(pattern);
    if (at !== -1 && at < earliest) {
      earliest = at;
      keys.layoutTypeKey = key;
    }
  }
  return keys;
};

/**
 * A unit type with the keys its name prints filled in where the reader left them out.
 * Never replaces a key that is already there.
 */
export const withKeysFromName = <
  T extends { variantName: string } & UnitTypeKeys,
>(
  variant: T,
): T => {
  const printed = unitTypeKeysFromName(variant.variantName);
  return {
    ...variant,
    ...(variant.bhkTypeKey === undefined && printed.bhkTypeKey !== undefined
      ? { bhkTypeKey: printed.bhkTypeKey }
      : {}),
    ...(variant.layoutTypeKey === undefined &&
    printed.layoutTypeKey !== undefined
      ? { layoutTypeKey: printed.layoutTypeKey }
      : {}),
  };
};
