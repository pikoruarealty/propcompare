import { describe, expect, it } from "vitest";
import {
  describeExtractionFailure,
  isExtractionActive,
} from "./extraction-status";

describe("describeExtractionFailure", () => {
  it("explains an out-of-credits provider without quoting the provider", () => {
    const text = describeExtractionFailure(
      "provider_error",
      'OpenRouter returned HTTP 402: {"error":"secret detail"}',
    );
    expect(text).toMatch(/out of credits/);
    expect(text).not.toMatch(/secret detail/);
  });

  it("says what to do for each known failure, and has a fallback", () => {
    for (const code of [
      "worker_interrupted",
      "configuration_error",
      "source_load_failed",
      "request_timeout",
      "output_length",
      "invalid_json",
      "provider_error",
      "evidence_persistence_failed",
      "something_new",
      null,
    ]) {
      expect(describeExtractionFailure(code, null)).toMatch(/\.$/);
    }
    expect(describeExtractionFailure("output_length", null)).toMatch(
      /Edit the page choices/,
    );
  });
});

describe("isExtractionActive", () => {
  it("is true only while queued or processing", () => {
    expect(["queued", "processing"].every(isExtractionActive)).toBe(true);
    expect(
      ["draft", "completed", "failed", "cancelled"].some(isExtractionActive),
    ).toBe(false);
  });
});
