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

1. An authorized admin uploads a source document and links it to an existing property where known.
2. The system records `source_documents` and OCR status.
3. OCR reads only active `property_schema_fields`. Each candidate retains value, confidence, source page, and quoted snippet in `property_submission_fields`.
4. The admin uses reconciliation to confirm, edit, or reject each field against evidence.
5. An admin may request changes, reject, or approve according to permissions.
6. The authorized publish operation transitions an approved submission to published, applies its payload to live catalog tables, and writes `property_revisions` in the same transaction.

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
