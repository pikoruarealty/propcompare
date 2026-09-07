# Admin and verification portal flow

**Status:** planned for Phase 2A.

## Purpose

Turn OCR-backed brochure data, RERA cross-checks, and developer proposals into a reviewed, traceable public catalog while preserving the single publish path.

## Brochure ingestion journey

```text
Upload brochure
  -> Create source document + submission
  -> OCR extracts active contract fields only
  -> Submission queue
  -> Field-by-field reconciliation with evidence
  -> Approve
  -> Publish transaction + revision snapshot
```

1. An authorized admin selects an existing canonical builder profile or creates one through the controlled admin builder-profile flow. This does not require the builder to have an account.
2. The admin links the brochure/submission to that profile and to an existing property where known.
3. The system records an immutable `source_documents` row and draft submission.
4. Cheap text-layer inspection may suggest page scopes. The uploader confirms every brochure page as project details, amenities, specifications, one unit-variant group, or ignored.
5. A unit-variant group may contain several ordered pages and optional page labels such as Lower floor and Upper floor. It still proposes exactly one canonical variant.
6. The system creates a versioned `ocr_extraction_jobs` attempt from the confirmed routing manifest. The implemented worker sends one native-PDF OpenRouter request per confirmed extraction scope and reads only active `property_schema_fields`; see [OCR adapter usage](../ocr-adapter-usage.md).
7. Each candidate retains value and confidence in `property_submission_fields`; its one-or-more page citations and snippets live in `property_submission_field_evidence`.
8. The admin uses reconciliation to confirm, edit, or reject each field against all supporting evidence pages.
9. The submitter submits the draft. An admin verifier or owner reviews it; only an owner publishes an approved submission. During the initial single-owner workflow, the same owner may perform each attributable step.
10. The authorized publish operation applies only submitted fields as an additive patch, writes live catalog changes, and records `property_revisions` in the same transaction. Omitted facts never delete published facts.

Historical OCR JSON can appear only in a derived comparison report. It cannot
populate the draft. Every selected brochure is rerun through the new pipeline
before reconciliation so one pipeline and field-contract version defines the
submission shape.

## Future builder self-serve journey

1. An admin creates/selects the same canonical builder profile and invites a
   staff user through `developer_users`.
2. Staff upload a brochure for only that linked profile, map pages, review the
   OCR draft, and submit it.
3. Staff cannot approve or publish. An admin independently reconciles, approves,
   and publishes the submission.

## RERA cross-check journey

1. A fetch job retrieves a RERA record for a known registration number and records fetched payload/matches.
2. A mismatch or new fact becomes a new `rera_scrape` submission.
3. The admin reviews it through the same field/review/publish workflow. The fetch job never updates live data directly.

## Permissions and boundaries

- Verifiers review assigned/available submissions as permitted.
- Owners administer higher-risk approval/publish operations, subject to the final permission model.
- Admins do not bypass a submission to make a catalog quick fix.
- Every live mutation is attributable to a published submission and revision snapshot.

## Exception paths

- OCR failure: retain document/status and allow controlled retry; do not publish partial unknown data.
- Low confidence or source conflict: mark field for review rather than accept automatically.
- Invalid payload: block approval/publish with a field-level validation explanation.
- Publish failure: preserve approved submission and leave no partial catalog writes; transaction rolls back.
