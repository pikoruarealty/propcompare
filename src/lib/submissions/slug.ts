import { createHash } from "node:crypto";

/**
 * Normalizes a property name into a URL slug base. Collisions are resolved
 * separately by appending a deterministic suffix derived from the
 * submission id (DECISIONS.md, "Submission review permissions and slug
 * generation are fixed for Phase 2A").
 */
export const slugifyPropertyName = (name: string): string => {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.length > 0 ? base : "property";
};

/**
 * Deterministic short suffix derived from the submission id, appended to a
 * base slug on a uniqueness conflict. Deterministic so retries within the
 * same publish transaction reproduce the same candidate rather than
 * generating a new random value each attempt.
 */
export const collisionSlug = (
  baseSlug: string,
  submissionId: string,
  attempt: number,
): string => {
  const hash = createHash("sha256")
    .update(`${submissionId}:${attempt}`)
    .digest("hex")
    .slice(0, 6);
  return `${baseSlug}-${hash}`;
};
