/**
 * Backfills the three schema v12 specification facts that Anamika High Point's
 * paid extraction read correctly and then discarded.
 *
 * Why they were lost: the extraction scopes partition their field keys, and
 * `property.specifications.*` was offered only to the specifications scope.
 * Anamika's vastu line and its nearby-landmark table are printed on project
 * pages (22 and 24), which went to the project-details scope — a scope that
 * was told those keys do not exist. The model read every value correctly and
 * put them in `unmappedRawEvidence`, which nothing persists. The partition is
 * fixed in `fieldsForScope`, but that only helps the next run; this property
 * is already published, so its own paid reading is recovered here instead of
 * being re-bought.
 *
 * Values are copied verbatim from the run's own checkpoint
 * (.local/ocr-checkpoints/dcfe6902-0454-46dd-bcf1-737a8e7a786d.json), never
 * retyped from the brochure and never inferred. Three facts qualify:
 *
 *   vastu_compliance  <- property.vastu_compliant      (page 22)
 *   nearby_hospitals  <- property.nearby_healthcare    (page 24)
 *   nearby_schools    <- property.nearby_education     (page 24)
 *
 * Deliberately NOT backfilled: the same page's malls (4) and lifestyle clubs
 * (2). `nearby_connectivity` is defined as transit/landmark travel time (a
 * metro station, an airport) and this brochure prints none, so filling it with
 * shopping distances would make the field mean something different here than
 * it does elsewhere — exactly the thing that breaks a comparison row. They
 * stay unrecorded until a field that actually means "nearby shopping" exists.
 * The amenities Claude under-read (gymnasium and others visible in the page 21
 * icon grid) are NOT added either: they have no extraction evidence, and
 * asserting them here would be inventing data rather than recovering it.
 *
 * Additive only: a key that already holds a value on the live property (one an
 * owner typed in, or a later run wrote) is skipped, never overwritten, and an
 * edit submission contains only the keys added here, so everything else on the
 * property keeps its published value.
 *
 * Writes through the one sanctioned path: an edit submission, approved and
 * published by an owner. Dry run unless --apply is passed.
 */
import { eq } from "drizzle-orm";
import { db } from "./index";
import {
  adminUsers,
  properties,
  propertySubmissionFields,
  propertySubmissions,
} from "./schema/catalog";
import {
  createEditSubmission,
  EditPropertyError,
} from "@/lib/submissions/edit-property";
import { getPublishedPropertyBySlug } from "@/lib/properties/queries";
import { publishSubmission } from "@/lib/submissions/publisher";

const apply = process.argv.includes("--apply");
const SLUG_LIKE = "anamika";

/** Verbatim from the checkpoint; the joiner matches how the page prints them. */
const BACKFILL: { fieldKey: string; value: string }[] = [
  {
    fieldKey: "property.specifications.vastu_compliance",
    value: "Vastu Compliant",
  },
  {
    fieldKey: "property.specifications.nearby_hospitals",
    value: "Apex Heart Institute 650 Mtr; Zydus Hospital 2.3 Km",
  },
  {
    fieldKey: "property.specifications.nearby_schools",
    value: "Nirma Vidyavihar 1.4 Km; Udgam School 1.6 Km",
  },
];

const [property] = await db
  .select({ id: properties.id, name: properties.name, slug: properties.slug })
  .from(properties)
  .where(eq(properties.slug, SLUG_LIKE));

const target =
  property ??
  (
    await db
      .select({
        id: properties.id,
        name: properties.name,
        slug: properties.slug,
      })
      .from(properties)
  ).find((row) => row.name.toLowerCase().includes(SLUG_LIKE));

if (!target) {
  console.error("Anamika High Point is not published; nothing to backfill.");
  process.exit(1);
}

console.log(`Target: ${target.name} (${target.slug})`);

const live = await getPublishedPropertyBySlug(db, target.slug);
const alreadyStated = new Set(
  (live?.specifications ?? [])
    .filter((spec) => spec.valueText !== null && spec.valueText.trim() !== "")
    .map((spec) => `property.specifications.${spec.key}`),
);
const toAdd = BACKFILL.filter(({ fieldKey }) => !alreadyStated.has(fieldKey));
for (const { fieldKey, value } of BACKFILL) {
  console.log(
    alreadyStated.has(fieldKey)
      ? `  ${fieldKey}\n    already stated, left as it is`
      : `  ${fieldKey}\n    = ${value}`,
  );
}
if (toAdd.length === 0) {
  console.log("\nNothing to add.");
  process.exit(0);
}

if (!apply) {
  console.log("\nDry run. Nothing was changed. Add --apply to publish it.");
  process.exit(0);
}

const [owner] = await db
  .select({ userId: adminUsers.userId })
  .from(adminUsers)
  .where(eq(adminUsers.permissionLevel, "owner"));
if (!owner) {
  console.error("No owner admin exists to approve this backfill.");
  process.exit(1);
}

let submissionId: string;
try {
  ({ submissionId } = await createEditSubmission(db, {
    propertyId: target.id,
    submittedBy: owner.userId,
  }));
} catch (cause) {
  if (cause instanceof EditPropertyError) {
    console.error(`${cause.message} (submission ${cause.submissionId ?? "?"})`);
    process.exit(1);
  }
  throw cause;
}
await db.insert(propertySubmissionFields).values(
  toAdd.map(({ fieldKey, value }) => ({
    submissionId,
    fieldKey,
    value,
    reviewStatus: "confirmed" as const,
  })),
);
await db
  .update(propertySubmissions)
  .set({ status: "approved", reviewedBy: owner.userId })
  .where(eq(propertySubmissions.id, submissionId));

const result = await publishSubmission({
  submissionId,
  actorUserId: owner.userId,
  actorRole: "owner",
});
console.log(
  `\nPublished backfill ${submissionId} (revision ${result.revisionId}).`,
);
process.exit(0);
