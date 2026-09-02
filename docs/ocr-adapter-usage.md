# OCR adapter usage

**Status:** implemented adapter/worker boundary; HTTP trigger and admin page
picker remain planned.

The production adapter calls Claude Sonnet 5 through OpenRouter, splits the
confirmed routing manifest into one native-PDF request per extraction scope,
and writes only contract-valid candidates into the draft submission. It never
writes to live property tables.

## Configuration

Set these server-side environment variables (never expose them to browser code
or commit real values):

```dotenv
OPENROUTER_API_KEY=...
OPENROUTER_OCR_MODEL=anthropic/claude-sonnet-5
OPENROUTER_OCR_MAX_COMPLETION_TOKENS=32000
OPENROUTER_OCR_MAX_REASONING_TOKENS=2048
OPENROUTER_OCR_REQUEST_TIMEOUT_MS=480000

GCS_BUCKET=your-private-source-document-bucket
GCS_PROJECT_ID=...
GCS_CLIENT_EMAIL=...
GCS_PRIVATE_KEY=...
```

`GCS_CLIENT_EMAIL` and `GCS_PRIVATE_KEY` are optional when Application Default
Credentials are available, but they must be provided together otherwise. A
`source_documents.gcs_path` may be either an object name within `GCS_BUCKET` or
a complete `gs://bucket/object.pdf` path.

## Calling the worker boundary

Create the draft `property_submissions`, immutable `source_documents`, and
queued `ocr_extraction_jobs` rows first. The job must contain a fully confirmed
v1 routing manifest and the active pipeline/field-schema versions. Then call:

```ts
import { createOpenRouterOcrAdapter } from "@/lib/ocr/adapter";
import { executeOcrExtractionJob } from "@/lib/ocr/ingestion";
import { createGcsSourcePdfLoader } from "@/lib/ocr/source-loader";

const adapter = createOpenRouterOcrAdapter({
  loadSourcePdf: createGcsSourcePdfLoader(),
});

const result = await executeOcrExtractionJob({
  jobId: queuedOcrJobId,
  adapter,
});

// Show these to the reconciliation/admin workflow; they were deliberately
// not inserted because they have no active canonical destination.
console.info(result.unmappedRawEvidence);
```

Call this only from a trusted server worker or future authenticated admin route.
Do not call it from a Client Component. The function transitions the job from
`draft`/`queued` to `processing`, loads active `property_schema_fields`, invokes
the adapter, and transactionally inserts `property_submission_fields` plus
their `property_submission_field_evidence`. Every inserted field starts as
`needs_review`. A pre-existing submission field is never overwritten.

## Provider and failure behavior

- Each non-ignored routing scope becomes a physically trimmed PDF excerpt and a
  separate request. A multi-page unit scope still returns exactly one variant.
- Requests use `anthropic/claude-sonnet-5`, OpenRouter's `file-parser` plugin
  with `pdf.engine: "native"`, JSON-object response format, 32,000 maximum
  completion tokens, and 2,048 maximum reasoning tokens by default.
- Network failures and HTTP 408/429/5xx responses retry once after one second.
  Invalid JSON, any non-`stop` finish reason, and `finish_reason=length` do not
  retry because each request is already the smallest human-confirmed scope;
  the job becomes `failed` for human re-routing.
- Fields outside the active contract are returned in `unmappedRawEvidence` and
  never become submission fields or live facts. Exact prices and commercial
  terms are forbidden even in that collection.
- `provider_job_id` stores the first OpenRouter scope request ID for operator
  lookup; all scope request IDs are returned as `result.providerRequestIds`.

Tests use generated blank PDFs and recorded synthetic responses. Do not add a
real brochure PDF or raw per-brochure provider response as a fixture. Obtain
explicit confirmation before running any paid real-brochure extraction.
