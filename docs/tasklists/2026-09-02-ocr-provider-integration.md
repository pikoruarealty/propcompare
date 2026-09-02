# Tasklist — OCR provider integration (Claude Sonnet 5 via OpenRouter)

**Status:** implementation complete; human spot-check pending
**Owner:** Bhavarth
**Branch:** `task/ocr-provider-integration`
**Roadmap:** [Phase 2A](../roadmap.md#phase-2a--admin-ingestion--the-trust-boundary)

## Scope

Implement `src/lib/ocr/adapter.ts` (defined as a contract-only type boundary
in the OCR routing foundation task) as a real, callable extraction adapter
that calls Claude Sonnet 5 through OpenRouter, using the configuration
validated in `docs/tasklists/2026-09-02-ocr-provider-selection.md` and the
provider-choice `DECISIONS.md` entry: native PDF ingestion via the
`file-parser` plugin (`pdf.engine: "native"`), per-unit-variant-scope
requests (not whole-brochure single-pass) to bound completion-token risk, and
output validated against the current `property_schema_fields` contract
(including the schema v5 additions once that tasklist lands).

The extraction prompt, page-scope batching logic, and response-shape
handling in the scratchpad's `run-comparison.ts` are working reference
material and should be read and adapted, not re-invented from scratch — but
none of the scratchpad's brochure PDFs or raw per-brochure result JSON may
enter the repository (see Non-goals).

## References

- [Canonical schema v3 (adapter contract types)](../schema/schema.v3.md)
- [Canonical schema v5 (new contract fields)](../schema/schema.v5.md)
- [Approved OCR field contract](../data/v1-property-schema-fields.proposal.2026-09-01.md)
- [OCR routing foundation tasklist](2026-09-01-phase-2a-ocr-routing-foundation.md)
- [OCR provider selection tasklist (bake-off findings)](2026-09-02-ocr-provider-selection.md)
- [DECISIONS.md — 2026-09-02 provider-selection and page-routing/extraction-split entries](../../DECISIONS.md)
- [Contributor rules](../../AGENTS.md)

## Non-goals

- Do not commit any brochure PDF or raw per-brochure OCR-result JSON to the
  repository, under any path — these can carry real, non-public property
  identity/address/price data. Test fixtures use synthetic or heavily
  redacted brochure content only.
- Do not commit the OpenRouter API key; it is an environment variable
  (`.env`, never `.env` committed), consistent with existing secret handling.
- Do not implement the admin page-picker UI or the HTTP route that triggers
  extraction — this task is the adapter/extraction call itself, callable by
  a not-yet-built route or a test harness.
- Do not change the publish transaction; adapter output feeds
  `property_submission_field_evidence` / submission fields the same way any
  other evidence source does, subject to the same review gate before publish.
- Do not run additional paid extraction calls against real brochures as part
  of this task's own verification beyond what's needed to prove the adapter
  works — reuse the bake-off's existing evidence where possible, and confirm
  before any new paid run per the standing "confirm before paid runs" rule.

## Discovery and decision gates

- [x] OCR provider selected: Claude Sonnet 5 via OpenRouter. Resolved
      2026-09-02 in `DECISIONS.md`.
- [x] Page-routing vs. extraction responsibility split resolved. Resolved
      2026-09-02 in `DECISIONS.md`.
- [x] Confirm exact OpenRouter request shape (model id, plugin config,
      max output tokens per scope, retry/backoff policy) as a concrete
      adapter implementation contract, derived from the scratchpad's
      `run-comparison.ts` — record any deviation from the bake-off's script
      as a note here, not silently.
- [x] Decide how adapter failures (invalid JSON, `finish_reason=length`,
      OpenRouter/provider errors) surface to the OCR job's attempt status
      defined in schema v3 — retry once with a smaller scope, or fail the
      attempt for human re-routing.

## Implementation checklist

- [x] Read `run-comparison.ts` in full from the scratchpad and extract the
      reusable pieces (extraction prompt, per-scope batching, OpenRouter
      request/response handling) into `src/lib/ocr/adapter.ts` and any
      supporting modules under `src/lib/ocr/`.
- [x] Implement the adapter against the provider-neutral types already
      defined in schema v3's foundation work, so a future provider swap
      stays a config/implementation change, not a contract change.
- [x] Validate adapter output against the active `property_schema_fields`
      contract before it becomes submission-field evidence; reject/flag
      unknown fields as `unmapped_raw_evidence`, never silently drop or
      silently invent a destination.
- [x] Wire the adapter's output into `property_submission_field_evidence`
      rows tied to the confirmed routing manifest and OCR job, per schema v3.
- [x] Add configuration for the OpenRouter API key and model id via
      environment variables, following existing secret-handling conventions.

## Verification

- [x] Unit tests cover: valid extraction response mapping to contract
      fields, unknown-field handling, malformed/invalid-JSON response
      handling, and the `finish_reason=length` failure path.
- [x] Integration test (or a recorded-fixture test using synthetic/redacted
      brochure content, not real brochures) proving one confirmed routing
      manifest produces evidence rows an admin can review.
- [ ] Human spot-check of field-level (not just structural) accuracy on the
      Adani Amaris and Kimana Towers brochures — carried over from the
      provider-selection tasklist, still outstanding.
- [x] `bun run format:check`
- [x] `bun run lint`
- [x] `bun run typecheck`
- [x] `bun run test`
- [x] `git diff --check`

## Acceptance criteria

- `src/lib/ocr/adapter.ts` is a real, callable extraction adapter, not a
  type-only contract.
- No brochure PDF or raw OCR result JSON exists anywhere in the repository.
- Adapter output can only become submission-field evidence, never a direct
  live catalog write.

## Documentation and handoff

- [x] Update `ARCHITECTURE.md` / admin app flow if the adapter's actual
      call shape differs materially from what they currently describe.
- [x] Add a developer usage guide covering configuration, invocation,
      persistence, and failure handling (`docs/ocr-adapter-usage.md`).
- [x] Update `PROGRESS.md` with outcome, verification, and the next bounded
      task (likely the admin page-picker UI or the HTTP route wiring carried
      forward from the submission-publish-flow tasklist).
- [ ] Complete this tasklist and retain it as project history.

## Implemented request and failure contract

- Model: `anthropic/claude-sonnet-5` by default, configurable with
  `OPENROUTER_OCR_MODEL`.
- OpenRouter request: streaming chat completions, `response_format` JSON
  object, `provider.require_parameters: true`, and
  `plugins: [{ id: "file-parser", pdf: { engine: "native" } }]`.
- Budget: 32,000 completion tokens, 2,048 reasoning tokens, and an eight-minute
  timeout per human-confirmed scope; each is environment-configurable.
- Batching: every non-ignored scope is physically copied into its own PDF
  excerpt. This is stricter than the final bake-off script's special-cased
  Kimana batching and generalizes that working behavior to every manifest.
- Retry: one retry after one second for non-timeout network failures and HTTP
  408/429/5xx. Invalid JSON, `finish_reason=length`, other non-stop finishes,
  and timeouts fail the whole attempt without partial evidence writes. Since a
  request is already one indivisible confirmed scope, further automatic
  splitting would violate the manifest; a human must re-route and create a new
  attempt.
- Unknown fields are returned as `unmappedRawEvidence` and never inserted.
  Commercial fields/values cause a hard failure rather than being retained even
  there. A pre-existing submission field also causes persistence to fail rather
  than silently overwriting reviewed work.

The only unchecked verification is the explicitly carried-over human comparison
against the two real brochures. No paid provider call was made in this task.
