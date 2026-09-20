import type { SubmissionLookups } from "@/lib/submissions/queue";
import {
  AREA_BASIS_LABEL,
  POSSESSION_STATUS_LABEL,
} from "@/lib/submissions/field-display";
import type { SubmissionUnitVariant } from "@/lib/submissions/validation";

const labelFor = (
  items: { key: string; label: string }[],
  key: unknown,
): string => items.find((i) => i.key === key)?.label ?? String(key);

const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "long" });

/**
 * A stored field value as a person would read it: labels not keys, chips for
 * amenities, a compact card per unit type. Anything unexpected falls back to
 * plain text so a value is never hidden from the reviewer.
 */
export function FieldValue({
  dataType,
  value,
  lookups,
}: {
  dataType: string;
  value: unknown;
  lookups: SubmissionLookups;
}) {
  if (dataType === "amenity_key_array" && Array.isArray(value)) {
    return (
      <ul className="flex flex-wrap gap-1.5" aria-label="Amenities">
        {value.map((key) => (
          <li
            key={String(key)}
            className="border-border bg-muted text-foreground rounded-full border px-2.5 py-0.5 text-sm"
          >
            {labelFor(lookups.amenities, key)}
          </li>
        ))}
      </ul>
    );
  }

  if (dataType === "legal_entity_id") {
    const entity = lookups.legalEntities.find((item) => item.id === value);
    return (
      <p>{entity ? entity.label : "An entity that is no longer recorded"}</p>
    );
  }

  if (dataType === "unit_variant_array" && Array.isArray(value)) {
    return (
      <ul className="flex flex-col gap-2">
        {(value as SubmissionUnitVariant[]).map((v, i) => (
          <li
            key={`${v.variantName}-${i}`}
            className="border-border rounded-md border p-3"
          >
            <p className="font-display text-lg leading-tight">
              {v.variantName}
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              {[
                v.bhkTypeKey ? labelFor(lookups.bhkTypes, v.bhkTypeKey) : null,
                v.layoutTypeKey
                  ? labelFor(lookups.layoutTypes, v.layoutTypeKey)
                  : null,
                v.totalUnitsOfVariant ? `${v.totalUnitsOfVariant} units` : null,
                v.unitsPerFloor ? `${v.unitsPerFloor} per floor` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "No other details stated"}
            </p>
            {v.areas && v.areas.length > 0 ? (
              <p className="data-tabular mt-1 text-sm">
                {v.areas
                  .map(
                    (a) =>
                      `${AREA_BASIS_LABEL[a.basis] ?? a.basis} ${a.areaSqft} sq ft`,
                  )
                  .join(" · ")}
              </p>
            ) : null}
            {v.dimensions?.rooms?.length ? (
              <p className="text-muted-foreground mt-1 text-xs">
                {v.dimensions.rooms.length} room dimension
                {v.dimensions.rooms.length === 1 ? "" : "s"} recorded
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }

  if (dataType === "possession_status") {
    return (
      <span>{POSSESSION_STATUS_LABEL[String(value)] ?? String(value)}</span>
    );
  }
  if (dataType === "property_type_key") {
    return <span>{labelFor(lookups.propertyTypes, value)}</span>;
  }
  if (dataType === "date" && typeof value === "string") {
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      <span className="data-tabular">
        {Number.isNaN(parsed.valueOf()) ? value : dateFormat.format(parsed)}
      </span>
    );
  }
  if (dataType === "percentage_0_to_100") {
    return <span className="data-tabular">{String(value)}%</span>;
  }
  if (dataType === "positive_integer" || dataType === "positive_number") {
    return <span className="data-tabular">{String(value)}</span>;
  }
  return (
    <span className="break-words whitespace-pre-line">
      {typeof value === "string" ? value : JSON.stringify(value)}
    </span>
  );
}
