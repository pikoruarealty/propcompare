import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  propertySubmissionMedia,
  propertySubmissions,
} from "@/db/schema/catalog";
import type { StorageAdapter } from "@/lib/storage/adapter";

const UUID = /^[0-9a-f-]{36}$/i;
export const MAX_SUBMISSION_MEDIA_BYTES = 15 * 1024 * 1024;

export class SubmissionMediaError extends Error {
  constructor(
    public readonly code:
      | "submission_not_found"
      | "invalid_state"
      | "invalid_media"
      | "media_not_found"
      | "already_added",
    message: string,
  ) {
    super(message);
  }
}

const extensionForImage = (bytes: Uint8Array): "jpg" | "png" | "webp" => {
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  const isWebp =
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (isJpeg) return "jpg";
  if (isPng) return "png";
  if (isWebp) return "webp";
  throw new SubmissionMediaError(
    "invalid_media",
    "Upload a JPEG, PNG, or WebP image.",
  );
};

const trimRequired = (
  value: string,
  label: string,
  maximum: number,
): string => {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maximum) {
    throw new SubmissionMediaError(
      "invalid_media",
      `${label} is required and must be at most ${maximum} characters.`,
    );
  }
  return trimmed;
};

const trimOptional = (
  value: string | undefined,
  label: string,
  maximum: number,
): string | null => {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length > maximum) {
    throw new SubmissionMediaError(
      "invalid_media",
      `${label} must be at most ${maximum} characters.`,
    );
  }
  return trimmed || null;
};

export const requireEditableSubmission = async (
  database: PostgresJsDatabase,
  submissionId: string,
) => {
  if (!UUID.test(submissionId)) {
    throw new SubmissionMediaError(
      "submission_not_found",
      "Submission not found.",
    );
  }
  const [submission] = await database
    .select({ id: propertySubmissions.id, status: propertySubmissions.status })
    .from(propertySubmissions)
    .where(eq(propertySubmissions.id, submissionId));
  if (!submission) {
    throw new SubmissionMediaError(
      "submission_not_found",
      "Submission not found.",
    );
  }
  if (
    submission.status !== "draft" &&
    submission.status !== "changes_requested"
  ) {
    throw new SubmissionMediaError(
      "invalid_state",
      "Only draft or changes-requested submissions can receive media.",
    );
  }
};

/** Stores an admin/developer supplied image once under an immutable key, then
 * creates only a submission-media candidate. It cannot create live media. */
export const addSubmissionImage = async (
  deps: { database: PostgresJsDatabase; storage: StorageAdapter },
  input: {
    submissionId: string;
    uploadedBy: string;
    bytes: Uint8Array;
    mediaType: "photo" | "floor_plan";
    sourceKind: "own" | "developer_supplied";
    attribution: string;
    caption?: string;
    unitVariantName?: string;
  },
): Promise<{ id: string }> => {
  await requireEditableSubmission(deps.database, input.submissionId);
  if (
    input.bytes.byteLength === 0 ||
    input.bytes.byteLength > MAX_SUBMISSION_MEDIA_BYTES
  ) {
    throw new SubmissionMediaError(
      "invalid_media",
      `Images must be between 1 byte and ${MAX_SUBMISSION_MEDIA_BYTES / 1024 / 1024} MB.`,
    );
  }
  const extension = extensionForImage(input.bytes);
  const attribution = trimRequired(input.attribution, "Attribution", 240);
  const caption = trimOptional(input.caption, "Caption", 500);
  const unitVariantName = trimOptional(
    input.unitVariantName,
    "Unit variant",
    160,
  );
  const objectKey = `submission-media/${randomUUID()}.${extension}`;
  await deps.storage.upload({
    path: objectKey,
    body: input.bytes,
    contentType: `image/${extension === "jpg" ? "jpeg" : extension}`,
  });
  try {
    return await deps.database.transaction(async (tx) => {
      const [submission] = await tx
        .select({
          id: propertySubmissions.id,
          status: propertySubmissions.status,
        })
        .from(propertySubmissions)
        .where(eq(propertySubmissions.id, input.submissionId))
        .for("update");
      if (!submission) {
        throw new SubmissionMediaError(
          "submission_not_found",
          "Submission not found.",
        );
      }
      if (
        submission.status !== "draft" &&
        submission.status !== "changes_requested"
      ) {
        throw new SubmissionMediaError(
          "invalid_state",
          "The submission is no longer editable.",
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
          uploadedBy: input.uploadedBy,
          mediaType: input.mediaType,
          sourceKind: input.sourceKind,
          gcsPath: objectKey,
          caption,
          attribution,
          unitVariantName,
          displayOrder: (last?.displayOrder ?? -1) + 1,
          isPublic: false,
          reviewStatus: "needs_review",
        })
        .returning({ id: propertySubmissionMedia.id });
      return media;
    });
  } catch (cause) {
    await deps.storage.delete(objectKey).catch(() => undefined);
    throw cause;
  }
};

export const reviewSubmissionMedia = async (
  database: PostgresJsDatabase,
  input: {
    submissionId: string;
    mediaId: string;
    reviewedBy: string;
    reviewStatus: "confirmed" | "rejected";
    isPublic: boolean;
  },
): Promise<void> => {
  if (!UUID.test(input.submissionId) || !UUID.test(input.mediaId)) {
    throw new SubmissionMediaError(
      "media_not_found",
      "Media candidate not found.",
    );
  }
  const [submission] = await database
    .select({ status: propertySubmissions.status })
    .from(propertySubmissions)
    .where(eq(propertySubmissions.id, input.submissionId));
  if (!submission) {
    throw new SubmissionMediaError(
      "submission_not_found",
      "Submission not found.",
    );
  }
  if (submission.status !== "in_review") {
    throw new SubmissionMediaError(
      "invalid_state",
      "Media can only be reviewed while the submission is in review.",
    );
  }
  const updated = await database
    .update(propertySubmissionMedia)
    .set({
      reviewStatus: input.reviewStatus,
      isPublic: input.reviewStatus === "confirmed" && input.isPublic,
      reviewedBy: input.reviewedBy,
      reviewedAt: new Date(),
    })
    .where(
      and(
        eq(propertySubmissionMedia.id, input.mediaId),
        eq(propertySubmissionMedia.submissionId, input.submissionId),
      ),
    )
    .returning({ id: propertySubmissionMedia.id });
  if (updated.length === 0) {
    throw new SubmissionMediaError(
      "media_not_found",
      "Media candidate not found.",
    );
  }
};
