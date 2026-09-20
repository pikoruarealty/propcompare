/**
 * What an admin is told about an extraction run. Pure and free of database and
 * server imports, so screens can use it. Never carries a cost: provider spend
 * lives only in the admin Usage tab.
 */

export type ExtractionState =
  "draft" | "queued" | "processing" | "completed" | "failed" | "cancelled";

export const isExtractionActive = (state: string): boolean =>
  state === "queued" || state === "processing";

/**
 * A plain-language reason for a failed run. The stored message can quote a
 * provider response, so screens show this instead of it.
 */
export const describeExtractionFailure = (
  errorCode: string | null,
  errorMessage: string | null,
): string => {
  if (errorMessage?.includes("HTTP 402")) {
    return "The AI provider account is out of credits. Add credits at OpenRouter, then try again.";
  }
  switch (errorCode) {
    case "worker_interrupted":
      return "The server stopped while this was being read. Nothing was saved; you can try again.";
    case "configuration_error":
      return "The AI provider is not configured on this server (missing API key).";
    case "source_load_failed":
      return "The brochure file could not be opened from storage.";
    case "request_timeout":
      return "The AI provider took too long to answer. You can try again.";
    case "output_length":
      return "A group of pages produced more than could be read in one go. Edit the page choices (for example split up the floor plans) and queue it again.";
    case "invalid_json":
    case "invalid_response":
      return "The AI provider returned an answer that could not be used. You can try again.";
    case "provider_error":
      return "The AI provider reported an error. You can try again in a moment.";
    case "evidence_persistence_failed":
      return "The extracted values could not be saved. You can try again.";
    default:
      return "The extraction failed unexpectedly. You can try again; if it keeps failing, check the server log.";
  }
};
