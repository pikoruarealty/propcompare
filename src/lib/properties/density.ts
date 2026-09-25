import { areaToSqft } from "@/lib/units/measurements";
import { formatSqft } from "./dossier";
import type { PropertyDossier } from "./types";

/**
 * Land area and density worked out from stated inputs, shared by the comparison
 * and the dossier so the two can never disagree. Pure: arithmetic over facts
 * already held, never a guess. If either input is missing the answer is `null`
 * ("not stated"), not a smaller or wrong number.
 *
 * Density replaced the `density_units_per_acre` specification (schema v18): the
 * regulator states the land area and the unit count on every registration, so the
 * number is calculated rather than typed from a brochure.
 */

const positive = (value: string | number | null): number | null => {
  const number = value === null ? NaN : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

/** Square feet in an acre, from the one place units are defined. */
const SQFT_PER_ACRE = areaToSqft(1, "acre");

export interface LandArea {
  sqft: number;
  /** True when the property states no plot area of its own and this is the
   * regulator's land area (owner-approved fallback, 2026-09-24). */
  fromRera: boolean;
}

export const landAreaOf = (dossier: PropertyDossier): LandArea | null => {
  const own = positive(dossier.plotAreaSqft);
  if (own !== null) return { sqft: own, fromRera: false };
  const rera = positive(dossier.rera.projectLandAreaSqft);
  return rera === null ? null : { sqft: rera, fromRera: true };
};

export const landAreaText = (land: LandArea): string =>
  `${formatSqft(String(Math.round(land.sqft)))} sq ft (${(land.sqft / SQFT_PER_ACRE).toFixed(2)} acres)${land.fromRera ? ", per RERA" : ""}`;

export const unitsPerAcre = (
  dossier: PropertyDossier,
): { perAcre: number; fromRera: boolean } | null => {
  const land = landAreaOf(dossier);
  const units = positive(dossier.totalUnits);
  if (land === null || units === null) return null;
  return {
    perAcre: units / (land.sqft / SQFT_PER_ACRE),
    fromRera: land.fromRera,
  };
};

/** "40.3 units per acre (land area per RERA)", or null when it cannot be worked out. */
export const densityText = (dossier: PropertyDossier): string | null => {
  const density = unitsPerAcre(dossier);
  if (density === null) return null;
  const rounded = Math.round(density.perAcre * 10) / 10;
  return `${rounded} units per acre${density.fromRera ? " (land area per RERA)" : ""}`;
};
