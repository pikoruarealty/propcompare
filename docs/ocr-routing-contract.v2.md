# OCR routing-manifest contract — v2

**Status:** active application contract as of 2026-09-20
**Extends:** the v1 routing-manifest boundary documented in
[schema.v3.md](schema/schema.v3.md). The `ocr_extraction_jobs.routing_manifest`
database column is unchanged.

## Why v2 exists

The v1 `unit_variant` scope requires a human to name one variant before
extraction. That is appropriate for a hand-routed, known unit. It is not
appropriate for a brochure's complete set of floor-plan pages: the same unit
can span multiple levels and a typical-floor plate can show several units.

The approved routing design therefore keeps Gemini at page-level recall and
asks Claude to discover unit variants after a human has confirmed all
floor-plan pages as one scope. See `DECISIONS.md` 2026-09-20 and
`docs/tasklists/2026-09-02-ocr-provider-selection.md`, finding 3.

## Compatibility

`parseOcrRoutingManifest` accepts both versions. A v1 manifest retains its
original kinds and rules unchanged. New confirmed manifests use `version:
"v2"`; v2 adds only the scope below.

```json
{
  "version": "v2",
  "pageCount": 12,
  "scopes": [
    {
      "scopeKey": "project",
      "kind": "property_details",
      "label": "Project details",
      "pages": [{ "pageNumber": 1 }]
    },
    {
      "scopeKey": "floor-plans",
      "kind": "floor_plans",
      "label": "Confirmed floor plans",
      "pages": [{ "pageNumber": 8 }, { "pageNumber": 9 }]
    },
    {
      "scopeKey": "ignored",
      "kind": "ignore",
      "label": "Not relevant",
      "pages": [{ "pageNumber": 2 }]
    }
  ]
}
```

The sample omits pages only for brevity; a real manifest still explicitly
routes or ignores every source page.

## `floor_plans` scope rules

- At most one `floor_plans` scope exists in a v2 manifest.
- It has one or more unique page numbers in ascending original-document order.
- It has no `variant` object. It is workflow metadata, never a second
  canonical unit-variant representation.
- A page cannot appear in two identity-producing scopes (`unit_variant` or
  `floor_plans`), and cannot be both ignored and extracted.
- The scope is an extraction scope. Its pages are sent to Claude together;
  the provider may return zero or more variants.

## Provider response

For `floor_plans`, the adapter accepts:

```json
{
  "fields": [],
  "unitVariants": [
    {
      "variantName": "3 BHK - Type A",
      "details": {
        "areas": [{ "basis": "carpet", "areaSqft": 1240 }]
      },
      "confidence": 0.91,
      "evidence": [{ "pageNumber": 8, "sourceSnippet": "3 BHK Type A" }]
    }
  ],
  "unmappedRawEvidence": []
}
```

Every discovered variant has a non-empty, evidence-backed `variantName`; names
are unique case-insensitively across all variants extracted from the manifest.
`bhkTypeKey` and `layoutTypeKey` are deliberately not provider output: they
remain optional approved-lookup values that a human may set in reconciliation.
All candidate evidence must cite a page in the scope. The established ban on
prices and commercial terms applies to this response too.

The adapter turns all variants into the one existing `unit_variants` submission
field. Evidence uses `$[0]`, `$[1]`, and so on to identify the relevant array
item. No live catalog table is touched until the existing reviewed publish
transaction runs.
