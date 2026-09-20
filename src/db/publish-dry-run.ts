import { db, dbClient } from "@/db";
import { adminUsers } from "@/db/schema/catalog";
import { publishSubmission } from "@/lib/submissions/publisher";

/**
 * Rehearses publishing an approved submission: runs the real publish transaction
 * and rolls it back, so it reports whether publishing would work (or why not)
 * without changing the live catalog.
 *
 *   bun run src/db/publish-dry-run.ts <submission-id>
 */
const submissionId = process.argv[2];
if (!submissionId) throw new Error("Give the submission id.");
try {
  // The publish records who did it, so it needs a real admin even for a rehearsal.
  const [admin] = await db
    .select({ userId: adminUsers.userId })
    .from(adminUsers)
    .limit(1);
  if (!admin) throw new Error("No admin exists; run bun run db:first-admin.");
  const result = await publishSubmission({
    submissionId,
    actorUserId: admin.userId,
    actorRole: "owner",
    dryRun: true,
  });
  console.info("Would publish:", JSON.stringify(result));
} catch (error) {
  console.error(
    "Would NOT publish:",
    error instanceof Error ? error.message.slice(0, 600) : error,
  );
  process.exitCode = 1;
} finally {
  await dbClient.end({ timeout: 5 });
}
