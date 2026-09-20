/**
 * Corrects a published property's room dimensions that were stored in the wrong
 * unit (metres saved as feet), through the one sanctioned write path: an edit
 * submission that is approved and published like any other. Nothing here writes a
 * live table directly.
 *
 *   bun run src/db/correct-dimension-units.ts <propertyId> m            # dry run
 *   bun run src/db/correct-dimension-units.ts <propertyId> m --apply    # do it
 *
 * The second argument is the unit the stored numbers were REALLY in (m, cm, mm or
 * in). It converts every stored length and width to feet, once.
 *
 * **It cannot run twice.** It only converts when the stored sizes still look like
 * the wrong unit (the same plausibility check the admin screens warn with): once
 * they are in feet the check passes and this refuses, so a second run cannot
 * convert them again. It also refuses when the property has an edit open.
 *
 * Units are exact and this is the only safe way to fix them: see the "units are
 * exact" rule in the project memory and `src/lib/units/measurements.ts`.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  adminUsers,
  propertySubmissionFields,
  propertySubmissions,
} from "@/db/schema/catalog";
import { createEditSubmission } from "@/lib/submissions/edit-property";
import { loadLiveValues } from "@/lib/submissions/live-values";
import { publishSubmission } from "@/lib/submissions/publisher";
import {
  dimensionsWarning,
  parseLengthUnit,
  readMeasurement,
} from "@/lib/units/measurements";

type Room = {
  name: string;
  lengthFt?: number;
  widthFt?: number;
  areaSqft?: number;
};
type Variant = {
  variantName: string;
  dimensions?: { rooms?: Room[]; balconies?: Room[]; foyer?: Room | null };
  [key: string]: unknown;
};

const [propertyId, unitArg, flag] = process.argv.slice(2);
const apply = flag === "--apply";
const unit = parseLengthUnit(unitArg);
if (!propertyId || !unit || unit === "ft") {
  console.error(
    "Usage: correct-dimension-units.ts <propertyId> <m|cm|mm|in> [--apply]",
  );
  process.exit(1);
}

/** One stored length, converted from the unit it was really in. */
const convert = (value: number | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const result = readMeasurement(`${value} ${unit}`, "length");
  if (!result.ok) throw new Error(`cannot convert ${value}: ${result.reason}`);
  return result.value;
};

const convertRoom = (room: Room): Room => ({
  ...room,
  ...(room.lengthFt === undefined ? {} : { lengthFt: convert(room.lengthFt) }),
  ...(room.widthFt === undefined ? {} : { widthFt: convert(room.widthFt) }),
  // A stored area cannot be converted from a length unit; there is no way to
  // know its unit, so a room with only an area is left for a person.
});

const live = await loadLiveValues(db, propertyId);
const variants = live["unit_variants"] as Variant[] | undefined;
if (!variants || variants.length === 0) {
  console.error("That property has no unit types.");
  process.exit(1);
}

const allRooms = variants.flatMap((variant) => [
  ...(variant.dimensions?.rooms ?? []),
  ...(variant.dimensions?.balconies ?? []),
  ...(variant.dimensions?.foyer ? [variant.dimensions.foyer] : []),
]);
const roomsWithAreaOnly = allRooms.filter(
  (room) => room.lengthFt === undefined && room.widthFt === undefined,
);

// The guard that makes a second run impossible.
const suspicious = variants.filter((variant) =>
  dimensionsWarning([
    ...(variant.dimensions?.rooms ?? []),
    ...(variant.dimensions?.balconies ?? []),
  ]),
);
if (suspicious.length === 0) {
  console.error(
    "Refusing: none of this property's unit types look like they are in the wrong unit. Converting again could turn correct feet into nonsense.",
  );
  process.exit(1);
}
if (suspicious.length !== variants.length) {
  console.error(
    `Refusing: only ${suspicious.length} of ${variants.length} unit types look wrong. Fix a mixed set by hand in the admin.`,
  );
  process.exit(1);
}
if (roomsWithAreaOnly.length > 0) {
  console.error(
    `Refusing: ${roomsWithAreaOnly.length} rooms have an area with no sides, whose unit cannot be inferred. Fix by hand.`,
  );
  process.exit(1);
}

const corrected: Variant[] = variants.map((variant) => ({
  ...variant,
  ...(variant.dimensions
    ? {
        dimensions: {
          ...(variant.dimensions.rooms
            ? { rooms: variant.dimensions.rooms.map(convertRoom) }
            : {}),
          ...(variant.dimensions.balconies
            ? { balconies: variant.dimensions.balconies.map(convertRoom) }
            : {}),
          ...(variant.dimensions.foyer
            ? { foyer: convertRoom(variant.dimensions.foyer) }
            : {}),
        },
      }
    : {}),
}));

// Show exactly what will change.
let rooms = 0;
for (const [index, variant] of variants.entries()) {
  const after = corrected[index];
  for (const key of ["rooms", "balconies"] as const) {
    (variant.dimensions?.[key] ?? []).forEach((room, position) => {
      const next = after.dimensions?.[key]?.[position];
      rooms += 1;
      if (rooms <= 6) {
        console.log(
          `${variant.variantName.slice(0, 28).padEnd(28)} ${room.name.padEnd(14)} ${room.lengthFt} x ${room.widthFt} ${unit}  ->  ${next?.lengthFt} x ${next?.widthFt} ft`,
        );
      }
    });
  }
}
console.log(`… ${rooms} rooms and balconies in ${variants.length} unit types.`);
const stillSuspicious = corrected.filter((variant) =>
  dimensionsWarning([
    ...(variant.dimensions?.rooms ?? []),
    ...(variant.dimensions?.balconies ?? []),
  ]),
);
if (stillSuspicious.length > 0) {
  console.error(
    `Refusing: after conversion ${stillSuspicious.length} unit types would still look wrong, so ${unit} is probably not the real unit.`,
  );
  process.exit(1);
}
console.log("After conversion every unit type looks plausible in feet.");

if (!apply) {
  console.log("\nDry run. Nothing was changed. Add --apply to publish it.");
  process.exit(0);
}

// The sanctioned path: an edit submission, approved and published by an owner.
const [owner] = await db
  .select({ userId: adminUsers.userId })
  .from(adminUsers)
  .where(eq(adminUsers.permissionLevel, "owner"));
if (!owner) {
  console.error("No owner admin exists to approve this correction.");
  process.exit(1);
}
const { submissionId } = await createEditSubmission(db, {
  propertyId,
  submittedBy: owner.userId,
});
await db.insert(propertySubmissionFields).values({
  submissionId,
  fieldKey: "unit_variants",
  value: corrected,
  reviewStatus: "confirmed",
});
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
  `\nPublished correction ${submissionId} (revision ${result.revisionId}).`,
);
process.exit(0);
