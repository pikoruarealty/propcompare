import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { db, dbClient } from "@/db";
import {
  developers,
  properties,
  propertySubmissionMedia,
  propertySubmissions,
  sourceDocuments,
  ocrExtractionJobs,
} from "@/db/schema/catalog";
import { storageAdapter } from "@/lib/storage";

/**
 * Removes draft data left behind by testing: unpublished submissions (with their
 * brochure, images and extraction attempts) and developer profiles that own no
 * property. Nothing that is published, or that a published property depends on, is
 * touched, and it never writes a live catalog table. The AI usage ledger is
 * append-only and is kept.
 *
 *   bun run src/db/cleanup-test-data.ts <keep-submission-id>[,<id>...]           (lists only)
 *   bun run src/db/cleanup-test-data.ts <keep-submission-id>[,<id>...] --apply   (deletes)
 *
 * The kept submissions, and the developers they belong to, are preserved.
 */
const keepArg = process.argv[2];
const apply = process.argv.includes("--apply");
if (!keepArg)
  throw new Error("Give the submission id(s) to keep, comma separated.");
const keepIds = keepArg.split(",").map((id) => id.trim());

try {
  const keptDevelopers = await db
    .select({ id: propertySubmissions.developerId })
    .from(propertySubmissions)
    .where(inArray(propertySubmissions.id, keepIds));
  const keepDeveloperIds = keptDevelopers.flatMap((row) =>
    row.id ? [row.id] : [],
  );
  const publishedDeveloperIds = (
    await db.select({ id: properties.developerId }).from(properties)
  ).map((row) => row.id);
  const protectedDevelopers = [
    ...new Set([...keepDeveloperIds, ...publishedDeveloperIds]),
  ];

  const doomedSubmissions = await db
    .select({
      id: propertySubmissions.id,
      status: propertySubmissions.status,
      source: propertySubmissions.source,
    })
    .from(propertySubmissions)
    .where(
      and(
        notInArray(propertySubmissions.id, keepIds),
        isNull(propertySubmissions.propertyId),
        sql`${propertySubmissions.status} <> 'published'`,
      ),
    );
  const doomedDevelopers = await db
    .select({ id: developers.id, name: developers.name })
    .from(developers)
    .where(
      protectedDevelopers.length > 0
        ? notInArray(developers.id, protectedDevelopers)
        : undefined,
    );

  const submissionIds = doomedSubmissions.map((row) => row.id);
  const documents = submissionIds.length
    ? await db
        .select({ id: sourceDocuments.id, path: sourceDocuments.gcsPath })
        .from(ocrExtractionJobs)
        .innerJoin(
          sourceDocuments,
          eq(sourceDocuments.id, ocrExtractionJobs.sourceDocumentId),
        )
        .where(inArray(ocrExtractionJobs.submissionId, submissionIds))
    : [];
  const media = submissionIds.length
    ? await db
        .select({ path: propertySubmissionMedia.gcsPath })
        .from(propertySubmissionMedia)
        .where(inArray(propertySubmissionMedia.submissionId, submissionIds))
    : [];

  console.info(`Keeping submissions: ${keepIds.join(", ")}`);
  console.info(`Submissions to delete: ${doomedSubmissions.length}`);
  for (const row of doomedSubmissions)
    console.info(`  ${row.id}  ${row.status}  ${row.source}`);
  console.info(
    `Developer profiles to delete (no property): ${doomedDevelopers.length}`,
  );
  for (const row of doomedDevelopers) console.info(`  ${row.name}`);
  console.info(
    `Brochure files: ${documents.length}, image files: ${media.length}`,
  );

  if (!apply) {
    console.info("\nNothing deleted. Re-run with --apply to delete.");
  } else {
    await db.transaction(async (tx) => {
      if (submissionIds.length > 0) {
        await tx
          .delete(propertySubmissions)
          .where(inArray(propertySubmissions.id, submissionIds));
        await tx.delete(sourceDocuments).where(
          inArray(
            sourceDocuments.id,
            documents.map((d) => d.id),
          ),
        );
      }
      if (doomedDevelopers.length > 0) {
        await tx.delete(developers).where(
          inArray(
            developers.id,
            doomedDevelopers.map((d) => d.id),
          ),
        );
      }
    });
    for (const file of [
      ...documents.map((d) => d.path),
      ...media.map((m) => m.path),
    ]) {
      await storageAdapter.delete(file).catch(() => undefined);
    }
    console.info("\nDeleted.");
  }
} finally {
  await dbClient.end({ timeout: 5 });
}
