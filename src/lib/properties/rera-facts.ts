import type { ReraSnapshot } from "@/lib/rera/snapshot";
import { areaToSqft } from "@/lib/units/measurements";
import { formatSqft } from "./dossier";

/**
 * The regulator's project facts (schema v17) as labelled lines for the dossier's
 * RERA section. Pure, so what is shown, and what is left out when the regulator
 * does not state it, is tested without a DOM. Every value is the regulator's: a
 * figure it does not state has no line, never a zero.
 */

export interface ReraFactLine {
  label: string;
  value: string;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const day = (iso: string | null): string | null => {
  if (iso === null) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getUTCDate()} ${MONTHS[parsed.getUTCMonth()]} ${parsed.getUTCFullYear()}`;
};

const sqft = (sqm: number): string =>
  `${formatSqft(String(Math.round(areaToSqft(sqm, "sqm"))))} sq ft`;

const percent = (value: number): string => `${Math.round(value * 10) / 10}%`;

const parties = (
  list: { name: string; projectsCompleted: number | null }[],
): string | null =>
  list.length === 0
    ? null
    : list
        .map((party) =>
          party.projectsCompleted === null
            ? party.name
            : `${party.name} (${party.projectsCompleted} projects)`,
        )
        .join("; ");

export const reraFactLines = (facts: ReraSnapshot): ReraFactLine[] => {
  const lines: ReraFactLine[] = [];
  const add = (label: string, value: string | null) => {
    if (value !== null && value !== "") lines.push({ label, value });
  };

  if (facts.openAreaSqm !== null) {
    const whole =
      facts.coveredAreaSqm !== null
        ? facts.openAreaSqm + facts.coveredAreaSqm
        : facts.layoutLandAreaSqm;
    add(
      "Open area",
      whole !== null && whole > 0
        ? `${sqft(facts.openAreaSqm)}, ${percent((facts.openAreaSqm / whole) * 100)} of the site`
        : sqft(facts.openAreaSqm),
    );
  }
  if (facts.coveredAreaSqm !== null) {
    add("Covered area", sqft(facts.coveredAreaSqm));
  }

  const inventory = facts.inventory;
  if (
    inventory &&
    inventory.availableUnits !== null &&
    inventory.totalUnits !== null
  ) {
    const asOn = day(inventory.asOn);
    add(
      "Units available",
      `${inventory.availableUnits} of ${inventory.totalUnits}${asOn ? `, as on ${asOn}` : ""}`,
    );
  }

  const filing = facts.filing;
  if (filing.quarter && filing.periodEndsOn) {
    add(
      "Latest quarterly filing",
      `${filing.quarter}, period ending ${day(filing.periodEndsOn)}`,
    );
  }
  for (const block of filing.blocks) {
    const parts = [
      block.progressPercent !== null
        ? `${percent(block.progressPercent)} complete`
        : null,
      block.floors !== null ? `${block.floors} floors` : null,
      block.lifts !== null ? `${block.lifts} lifts` : null,
    ].filter((part): part is string => part !== null);
    add(`Block ${block.name}`, parts.length > 0 ? parts.join(", ") : null);
  }

  add("Plans passed by", facts.planPassingAuthority);
  add("Registered with RERA on", day(facts.registeredOn));
  if (facts.filings) {
    add(
      "Regulator filings submitted",
      `${facts.filings.submitted} of ${facts.filings.listed}`,
    );
  }
  add("Architect", parties(facts.architects));
  add("Structural engineer", parties(facts.engineers));
  add("Contractor", parties(facts.contractors));
  return lines;
};
