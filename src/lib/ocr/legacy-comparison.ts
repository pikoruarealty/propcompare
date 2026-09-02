import type { SubmissionFieldCandidate } from "./adapter";
import { OcrContractError } from "./routing";

export interface LegacyEvaluationSnapshot {
  origin: "legacy_evaluation";
  fields: Record<string, unknown>;
}

export interface OcrComparisonDifference {
  fieldKey: string;
  legacyValue?: unknown;
  newValue?: unknown;
  status: "legacy_only" | "new_only" | "different" | "equal";
}

export const createLegacyEvaluationSnapshot = (
  fields: Record<string, unknown>,
): LegacyEvaluationSnapshot => ({ origin: "legacy_evaluation", fields });

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

export const compareLegacyWithNewPipeline = (
  legacy: LegacyEvaluationSnapshot,
  newFields: SubmissionFieldCandidate[],
): OcrComparisonDifference[] => {
  if (legacy.origin !== "legacy_evaluation") {
    throw new OcrContractError(
      "comparison input is not a legacy evaluation snapshot",
    );
  }
  const newByKey = new Map(
    newFields.map((field) => [field.fieldKey, field.value]),
  );
  const keys = [
    ...new Set([...Object.keys(legacy.fields), ...newByKey.keys()]),
  ].sort();

  return keys.map((fieldKey) => {
    const hasLegacy = Object.hasOwn(legacy.fields, fieldKey);
    const hasNew = newByKey.has(fieldKey);
    const legacyValue = legacy.fields[fieldKey];
    const newValue = newByKey.get(fieldKey);
    const status = !hasLegacy
      ? "new_only"
      : !hasNew
        ? "legacy_only"
        : stableJson(legacyValue) === stableJson(newValue)
          ? "equal"
          : "different";
    return {
      fieldKey,
      ...(hasLegacy ? { legacyValue } : {}),
      ...(hasNew ? { newValue } : {}),
      status,
    };
  });
};
