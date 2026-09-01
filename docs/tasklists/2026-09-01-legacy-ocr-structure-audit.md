# Tasklist — Legacy OCR structure audit

**Status:** complete — review required before lookup seeding
**Owner:** Deep
**Branch:** `task/lookup-catalog-data`
**Depends on:** [Lookup catalog data](2026-09-01-lookup-catalog-data.md)

## Purpose and scope

Read the user-authorized legacy OCR storage only to establish the reusable shape of its extraction output and propose controlled lookup/field-contract candidates. The corpus is known to contain copies; the source-audit target is 24 usable unique properties, not the file count.

This is an analysis-only task. It creates no property, unit, media, price, or property-to-lookup data in this repository or database.

## Source boundary

- [x] User authorized read-only analysis of `D:\Pikorua\pikorua-luxe-compare\property-ocr-suite\backend\storage` on 2026-09-01.
- [x] Scan current job JSON and historical JSON only as a deduplication corpus; treat backups as potentially stale duplicates.
- [x] Use an ephemeral, aggregate-only identity comparison solely to count duplicates. Do not copy comparison tokens, property identifiers, names, addresses, prices, free-text descriptions, source URLs, media, or raw JSON into this repository.
- [x] Exclude PDFs and images from this audit.

## Audit and review checklist

- [x] Record aggregate file/document shape, field-path presence, data types, and coverage in a versioned in-repository report.
- [x] Identify reusable OCR field-contract candidates and normalized amenity/specification vocabulary candidates, without associating them with any property.
- [x] Clearly mark inferred candidates as needing product approval; do not seed them yet.
- [x] Capture the user-confirmed usable-record count and automated-comparison limitation without exposing source identities.
- [x] Update the lookup-data tasklist with the review artifact and its remaining approval inputs.

## Handoff

- [x] Publish [the structural audit report](../data/legacy-ocr-structure-audit.2026-09-01.md).
- [ ] Obtain explicit approval for the amenity/specification lists, INR budget ranges, and OCR-field contract before editing `src/db/seed.ts`.
- [x] Update `PROGRESS.md` when the audit is complete.
