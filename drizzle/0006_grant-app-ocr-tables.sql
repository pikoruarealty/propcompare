-- Migration 0000 granted the application role CRUD on every public table that
-- existed at that point. Migration 0003 added these two OCR tables later, so
-- they need the same deliberately scoped application-role grant.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.ocr_extraction_jobs,
  public.property_submission_field_evidence
TO propcompare_app;
