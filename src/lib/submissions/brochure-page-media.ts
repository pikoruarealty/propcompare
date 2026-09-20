import { isWorkingStatus } from "./working-statuses";
import { and, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  propertySubmissionMedia,
  propertySubmissions,
} from "@/db/schema/catalog";
import { getSubmissionBrochure } from "@/lib/ingestion/queries";
import { renderBrochurePage } from "@/lib/ingestion/page-images";
import type { StorageAdapter } from "@/lib/storage/adapter";
import { requireEditableSubmission, SubmissionMediaError } from "./media";

/**
 * Uses a whole brochure page as an image candidate for its submission (owner
 * decision 2026-09-20): right for floor plans and for brochures whose photos fill
 * a page. The page is rendered on the server, stored once under a key derived
 * from the source document and page number, and becomes a *candidate* — private
 * and unreviewed, sourced from the developer's brochure and credited to the
 * developer. Nothing here can make anything public; the reviewer still approves
 * every image (DECISIONS.md 2026-09-19 media rights).
 *
 * The key is deterministic so the same page cannot be added twice to one
 * submission.
 */
export const addBrochurePageImage = async (
  deps: {
    database: PostgresJsDatabase;
    storage: StorageAdapter;
    render?: typeof renderBrochurePage;
  },
  input: {
    submissionId: string;
    uploadedBy: string;
    pageNumber: number;
    mediaType: "photo" | "floor_plan";
    unitVariantName?: string;
    caption?: string;
  },
): Promise<{ id: string }> => {
  const { database, storage } = deps;
  const render = deps.render ?? renderBrochurePage;

  await requireEditableSubmission(database, input.submissionId);
  const brochure = await getSubmissionBrochure(database, input.submissionId);
  if (!brochure) {
    throw new SubmissionMediaError(
      "invalid_media",
      "This submission has no brochure to take a page from.",
    );
  }
  if (
    !Number.isInteger(input.pageNumber) ||
    input.pageNumber < 1 ||
    input.pageNumber > brochure.pageCount
  ) {
    throw new SubmissionMediaError(
      "invalid_media",
      `Choose a page from 1 to ${brochure.pageCount}.`,
    );
  }

  const objectKey = `submission-media/brochure-${brochure.sourceDocumentId}-page-${input.pageNumber}.webp`;
  const [already] = await database
    .select({ id: propertySubmissionMedia.id })
    .from(propertySubmissionMedia)
    .where(
      and(
        eq(propertySubmissionMedia.submissionId, input.submissionId),
        eq(propertySubmissionMedia.gcsPath, objectKey),
      ),
    );
  if (already) {
    throw new SubmissionMediaError(
      "already_added",
      `Page ${input.pageNumber} is already in this submission's images.`,
    );
  }

  const pdf = await storage.download(brochure.storagePath);
  const rendered = await render(pdf, input.pageNumber);
  await storage.upload({
    path: objectKey,
    body: rendered.bytes,
    contentType: rendered.contentType,
  });

  const caption = input.caption?.trim() || `Brochure page ${input.pageNumber}`;
  const unitVariantName = input.unitVariantName?.trim() || null;
  if (caption.length > 500 || (unitVariantName?.length ?? 0) > 160) {
    await storage.delete(objectKey).catch(() => undefined);
    throw new SubmissionMediaError(
      "invalid_media",
      "The caption or unit type is too long.",
    );
  }

  try {
    return await database.transaction(async (tx) => {
      const [submission] = await tx
        .select({
          id: propertySubmissions.id,
          status: propertySubmissions.status,
        })
        .from(propertySubmissions)
        .where(eq(propertySubmissions.id, input.submissionId))
        .for("update");
      if (!submission || !isWorkingStatus(submission.status)) {
        throw new SubmissionMediaError(
          "invalid_state",
          "The submission is no longer editable.",
        );
      }
      // Re-checked under the lock so two simultaneous requests cannot both add it.
      const [duplicate] = await tx
        .select({ id: propertySubmissionMedia.id })
        .from(propertySubmissionMedia)
        .where(
          and(
            eq(propertySubmissionMedia.submissionId, submission.id),
            eq(propertySubmissionMedia.gcsPath, objectKey),
          ),
        );
      if (duplicate) {
        throw new SubmissionMediaError(
          "already_added",
          `Page ${input.pageNumber} is already in this submission's images.`,
        );
      }
      const [last] = await tx
        .select({ displayOrder: propertySubmissionMedia.displayOrder })
        .from(propertySubmissionMedia)
        .where(eq(propertySubmissionMedia.submissionId, submission.id))
        .orderBy(desc(propertySubmissionMedia.displayOrder))
        .limit(1);
      const [media] = await tx
        .insert(propertySubmissionMedia)
        .values({
          submissionId: submission.id,
          sourceDocumentId: brochure.sourceDocumentId,
          uploadedBy: input.uploadedBy,
          mediaType: input.mediaType,
          sourceKind: "developer_brochure",
          gcsPath: objectKey,
          caption,
          attribution: `Image from the ${brochure.developerName ?? "developer"} brochure`,
          unitVariantName,
          displayOrder: (last?.displayOrder ?? -1) + 1,
          // Choosing a brochure page as a picture is the admin's own decision:
          // approved and public by default, with its credit, and rejectable.
          isPublic: true,
          reviewStatus: "confirmed",
        })
        .returning({ id: propertySubmissionMedia.id });
      return media;
    });
  } catch (cause) {
    // The stored file belongs to the row that already exists in that case.
    const keepFile =
      cause instanceof SubmissionMediaError && cause.code === "already_added";
    if (!keepFile) await storage.delete(objectKey).catch(() => undefined);
    throw cause;
  }
};
