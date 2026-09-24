/**
 * Offers Anamika High Point's five floor-plan pages as needs-review image
 * candidates, tied to their unit types by the router's page captions
 * (`matchFloorPlanPages`). Nothing is published here: it opens an edit draft
 * holding the candidates, and an admin approves or deletes each in the Pictures
 * panel, then publishes the edit. The property has no floor plan pictures live
 * today; a unit type that already has one is left alone.
 *
 * Only the unit types' own names come from the live property (an owner may have
 * corrected them, and a publish refuses a name that matches nothing); the
 * brochure's page captions come from the confirmed routing manifest, and the
 * model's cited pages from its paid checkpoint, used only as a tie-breaker.
 *
 * Dry run unless --apply is passed.
 */
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "./index";
import { adminUsers, properties } from "./schema/catalog";
import {
  createEditSubmission,
  EditPropertyError,
} from "@/lib/submissions/edit-property";
import {
  autoMapFloorPlanImages,
  matchFloorPlanPages,
} from "@/lib/submissions/floor-plan-auto-map";
import { getPublishedPropertyBySlug } from "@/lib/properties/queries";
import { getSubmissionBrochure } from "@/lib/ingestion/queries";
import { parseOcrRoutingManifest } from "@/lib/ocr/routing";
import { storageAdapter } from "@/lib/storage";

const apply = process.argv.includes("--apply");
const SLUG = "anamika-high-point";
const JOB_ID = "dcfe6902-0454-46dd-bcf1-737a8e7a786d";
const CHECKPOINT = `.local/ocr-checkpoints/${JOB_ID}.json`;

const live = await getPublishedPropertyBySlug(db, SLUG);
if (!live) {
  console.error("Anamika High Point is not published; nothing to do.");
  process.exit(1);
}

const brochure = await getSubmissionBrochure(db, JOB_ID, "job");
if (!brochure) {
  console.error("The brochure behind that extraction is not on record.");
  process.exit(1);
}
const manifest = parseOcrRoutingManifest(
  brochure.routingManifest,
  brochure.pageCount,
);
const pages = manifest.scopes
  .filter(
    (scope) => scope.kind === "floor_plans" || scope.kind === "unit_variant",
  )
  .flatMap((scope) => scope.pages);

const checkpoint = JSON.parse(readFileSync(CHECKPOINT, "utf8")) as {
  result: {
    extraction: {
      unitVariants: {
        variantName?: string;
        evidence: { pageNumber: number }[];
      }[];
    };
  };
};
const citedPages = new Map(
  checkpoint.result.extraction.unitVariants.map((variant) => [
    variant.variantName,
    variant.evidence.map((item) => item.pageNumber),
  ]),
);

const hasPlan = new Set(
  live.media
    .filter((item) => item.mediaType === "floor_plan" && item.unitVariantId)
    .map((item) => item.unitVariantId),
);
const variants = live.unitVariants
  .filter((variant) => !hasPlan.has(variant.id))
  .map((variant) => ({
    variantName: variant.variantName,
    evidencePages: citedPages.get(variant.variantName) ?? [],
  }));

console.log(`Target: ${live.name} (${SLUG})`);
const matches = matchFloorPlanPages(variants, pages);
for (const variant of variants) {
  const found = matches.filter((m) => m.variantName === variant.variantName);
  console.log(
    `  ${variant.variantName}\n    -> ${
      found.length === 0
        ? "no page named it; left for a manual choice"
        : found.map((m) => `page ${m.pageNumber} (${m.label})`).join(", ")
    }`,
  );
}
if (matches.length === 0) {
  console.log("\nNothing to add.");
  process.exit(0);
}
if (!apply) {
  console.log(
    "\nDry run. Nothing was changed. Add --apply to create the draft.",
  );
  process.exit(0);
}

const [owner] = await db
  .select({ userId: adminUsers.userId })
  .from(adminUsers)
  .where(eq(adminUsers.permissionLevel, "owner"));
if (!owner) {
  console.error("No owner admin exists to own this draft.");
  process.exit(1);
}
const [property] = await db
  .select({ id: properties.id })
  .from(properties)
  .where(eq(properties.slug, SLUG));

let submissionId: string;
try {
  ({ submissionId } = await createEditSubmission(db, {
    propertyId: property.id,
    submittedBy: owner.userId,
  }));
} catch (cause) {
  if (cause instanceof EditPropertyError) {
    console.error(`${cause.message} (submission ${cause.submissionId ?? "?"})`);
    process.exit(1);
  }
  throw cause;
}
const { added, skipped } = await autoMapFloorPlanImages(
  { database: db, storage: storageAdapter },
  { submissionId, variants, pages },
);
console.log(
  `\nDraft ${submissionId}: ${added.length} floor plan(s) added for review, ${skipped.length} already there.`,
);
process.exit(0);
