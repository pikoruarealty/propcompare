# PropCompare canonical data schema — v3

**Status:** active schema baseline as of 2026-09-01
**Supersedes:** [schema v2](schema.v2.md) for new implementation work

Schema v3 retains every v1 entity and relationship plus the private budget
boundary introduced by schema v2, except for the ingestion changes below.
Earlier schema files remain immutable historical records.

## Versioned OCR attempts

`source_documents` describes an uploaded source and no longer owns aggregate
OCR status. A document may be processed more than once, so status belongs to
the attempt:

```text
ocr_extraction_jobs (
  id,
  source_document_id fk -> source_documents,
  submission_id fk -> property_submissions,
  status ocr_job_status,                 -- draft | queued | processing |
                                          -- completed | failed | cancelled
  pipeline_version,
  field_schema_version,
  provider_key nullable,
  provider_job_id nullable,
  routing_manifest jsonb,
  started_at nullable,
  completed_at nullable,
  error_code nullable,
  error_message nullable,
  created_at,
  updated_at
)
```

The application validates `routing_manifest` against a versioned contract.
For routing manifest v1 it contains the source page count and confirmed scopes:

- `property_details`, `amenities`, and `specifications` scopes identify only
  pages relevant to that approved contract area;
- a `unit_variant` scope contains one proposed variant name, optional approved
  BHK/layout keys, and one or more ordered pages;
- `ignore` explicitly excludes pages from extraction;
- pages use one-based PDF numbering and every source page must be routed or
  ignored before a draft job can be queued;
- one page cannot belong to two `unit_variant` scopes, and an ignored page
  cannot belong to any extraction scope.

The manifest is workflow metadata, not a second representation of a live unit
variant. It is immutable after the job leaves `draft`. Only the future reviewed
publish transaction can create or update `unit_variants`.

## Multi-page field evidence

`property_submission_fields` retains one row per submission and approved field
key, but no longer contains `source_document_id`, `source_page`, or
`source_snippet`. Evidence is represented once in a child relation:

```text
property_submission_field_evidence (
  id,
  submission_field_id fk -> property_submission_fields,
  ocr_extraction_job_id fk -> ocr_extraction_jobs nullable,
  source_document_id fk -> source_documents,
  source_page int,
  value_path text default '$',
  source_snippet text nullable,
  created_at,
  updated_at,
  unique (submission_field_id, source_document_id, source_page, value_path)
)
```

`value_path` identifies the part of a JSON field value supported by the
evidence, such as `$[0]` for the first item in the reviewed `unit_variants`
array. It is provenance only and does not change the canonical payload shape.
Manual submissions may cite document evidence without an OCR job.

## Historical OCR comparison boundary

Historical OCR JSON has no database ingestion entity and no production adapter
into submissions. Comparison code may normalize its approved field-shaped
values in memory and produce a derived evaluation report against a new-pipeline
result. Only output explicitly identified and validated as a new versioned
pipeline result may populate submission fields.

Every selected brochure is rerun through the new pipeline. Historical results
are never used as fallback property facts, and comparison reports never write
to live catalog tables.

## Deliberate deferral: structured building levels

Several ordered floor-plan pages may be attached to one unit-variant scope and,
after publication, become separate `property_media` rows for the same canonical
variant. Schema v3 does not add floor or level objects to
`unit_variants.dimensions`. Until that product requirement is explicitly
approved, extraction must not claim room-to-level structure the live catalog
cannot represent.
