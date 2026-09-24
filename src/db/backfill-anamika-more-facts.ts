/**
 * Puts four more facts that Anamika High Point's paid extraction read correctly
 * (and discarded, for want of a field) into its open edit draft, as needs-review
 * fields with their page evidence, for an owner to confirm in the review panel.
 * A follow-on to `backfill-anamika-location-facts.ts`, which published the
 * first three (vastu, nearby hospitals, nearby schools).
 *
 *   nearby_connectivity <- property.other_important_locations (page 24)
 *   parking_levels      <- property.basements                 (page 22)
 *   lifts_per_tower     <- property.elevators                 (page 22)
 *   podium_structure    <- property.podium_living_area        (page 22)
 *
 * Every value was checked against the rendered brochure page, not just the
 * checkpoint. The connectivity list is the checkpoint's structured
 * `other_important_locations`; its separate `location.distance_*` keys are NOT
 * used, because they are shifted against the printed table (the airport, Science
 * City and S. P. Ring Road distances are attached to the wrong names).
 *
 * Deliberately not added: shopping and lifestyle-club distances (no field means
 * that), "Upto 4 Car Parks", "3-Side Open Apartments", the consultants list and
 * "Kota/tiles in Wash Area" (no field exists for any of them).
 *
 * Additive only: a key already stated on the live property, or already in the
 * draft, is skipped. Nothing is published here. Dry run unless --apply.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "./index";
import {
  adminUsers,
  properties,
  propertySubmissionFieldEvidence,
  propertySubmissionFields,
  propertySubmissions,
} from "./schema/catalog";
import {
  createEditSubmission,
  EditPropertyError,
} from "@/lib/submissions/edit-property";
import { getPublishedPropertyBySlug } from "@/lib/properties/queries";
import { getSubmissionBrochure } from "@/lib/ingestion/queries";

const apply = process.argv.includes("--apply");
const SLUG = "anamika-high-point";
const JOB_ID = "dcfe6902-0454-46dd-bcf1-737a8e7a786d";
const OPEN = [
  "draft",
  "submitted",
  "in_review",
  "changes_requested",
  "approved",
] as const;

const FACTS: {
  fieldKey: string;
  value: string;
  page: number;
  snippet: string;
}[] = [
  {
    fieldKey: "property.specifications.nearby_connectivity",
    value:
      "Pakwan Circle/SBR 700 Mtr; Thaltej Metro Station 1.1 Km; Taj Skyline 3.7 Km; Baghban Party Plot 2.4 Km; S. P. Ring Road 4.1 Km; Science City 6.5 Km; Airport 16.2 Km",
    page: 24,
    snippet:
      "Other Important Locations Pakwan Circle/SBR 700 Mtr Thaltej Metro Station 1.1 Km Taj Skyline 3.7 Km Baghban Party Plot 2.4 Km S. P. Ring Road 4.1 Km Science City 6.5 Km Airport 16.2 Km",
  },
  {
    fieldKey: "property.specifications.parking_levels",
    value: "3 Level Basements",
    page: 22,
    snippet: "3 Level Basements",
  },
  {
    fieldKey: "property.specifications.lifts_per_tower",
    value: "5 High Speed & Spacious Elevator in each Block",
    page: 22,
    snippet: "5 High Speed & Spacious Elevator in each Block",
  },
  {
    fieldKey: "property.specifications.podium_structure",
    value: "70,000 Sq. Ft. Podium Living",
    page: 22,
    snippet: "70,000 Sq. Ft. Podium Living",
  },
];

const live = await getPublishedPropertyBySlug(db, SLUG);
if (!live) {
  console.error("Anamika High Point is not published; nothing to do.");
  process.exit(1);
}
const stated = new Set(
  live.specifications
    .filter((spec) => spec.valueText && spec.valueText.trim() !== "")
    .map((spec) => `property.specifications.${spec.key}`),
);

const [property] = await db
  .select({ id: properties.id })
  .from(properties)
  .where(eq(properties.slug, SLUG));
const [openEdit] = await db
  .select({ id: propertySubmissions.id })
  .from(propertySubmissions)
  .where(
    and(
      eq(propertySubmissions.propertyId, property.id),
      inArray(propertySubmissions.status, [...OPEN]),
    ),
  );
const inDraft = new Set(
  openEdit
    ? (
        await db
          .select({ key: propertySubmissionFields.fieldKey })
          .from(propertySubmissionFields)
          .where(eq(propertySubmissionFields.submissionId, openEdit.id))
      ).map((row) => row.key)
    : [],
);

const toAdd = FACTS.filter(
  (fact) => !stated.has(fact.fieldKey) && !inDraft.has(fact.fieldKey),
);
console.log(`Target: ${live.name} (${SLUG})`);
for (const fact of FACTS) {
  console.log(
    `  ${fact.fieldKey}\n    ${
      stated.has(fact.fieldKey)
        ? "already stated live, left as it is"
        : inDraft.has(fact.fieldKey)
          ? "already in the open draft, left as it is"
          : `= ${fact.value}`
    }`,
  );
}
console.log(
  openEdit
    ? `\nWill add to the open edit ${openEdit.id}.`
    : "\nNo open edit; will start a new draft.",
);
if (toAdd.length === 0) {
  console.log("Nothing to add.");
  process.exit(0);
}
if (!apply) {
  console.log("Dry run. Nothing was changed. Add --apply to add them.");
  process.exit(0);
}

const brochure = await getSubmissionBrochure(db, JOB_ID, "job");
if (!brochure) {
  console.error("The brochure behind that extraction is not on record.");
  process.exit(1);
}
let submissionId = openEdit?.id;
if (!submissionId) {
  const [owner] = await db
    .select({ userId: adminUsers.userId })
    .from(adminUsers)
    .where(eq(adminUsers.permissionLevel, "owner"));
  if (!owner) {
    console.error("No owner admin exists to own this draft.");
    process.exit(1);
  }
  try {
    ({ submissionId } = await createEditSubmission(db, {
      propertyId: property.id,
      submittedBy: owner.userId,
    }));
  } catch (cause) {
    if (cause instanceof EditPropertyError) {
      console.error(cause.message);
      process.exit(1);
    }
    throw cause;
  }
}
for (const fact of toAdd) {
  const [field] = await db
    .insert(propertySubmissionFields)
    .values({
      submissionId,
      fieldKey: fact.fieldKey,
      value: fact.value,
      reviewStatus: "needs_review",
    })
    .returning({ id: propertySubmissionFields.id });
  await db.insert(propertySubmissionFieldEvidence).values({
    submissionFieldId: field.id,
    ocrExtractionJobId: null,
    sourceDocumentId: brochure.sourceDocumentId,
    sourcePage: fact.page,
    sourceSnippet: fact.snippet,
  });
}
console.log(`\nAdded ${toAdd.length} field(s) to ${submissionId}.`);
process.exit(0);
