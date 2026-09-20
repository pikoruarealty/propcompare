/** The kinds of legal entity RERA registers a project under. Pure, so screens can import it. */
export const LEGAL_ENTITY_TYPES = [
  "company",
  "llp",
  "partnership",
  "proprietorship",
  "trust",
  "other",
] as const;

export type LegalEntityType = (typeof LEGAL_ENTITY_TYPES)[number];

export const LEGAL_ENTITY_TYPE_LABEL: Record<LegalEntityType, string> = {
  company: "Company",
  llp: "LLP",
  partnership: "Partnership",
  proprietorship: "Proprietorship",
  trust: "Trust",
  other: "Other",
};
