# PropCompare canonical data schema — v4

**Status:** active schema baseline as of 2026-09-01
**Supersedes:** [schema v3](schema.v3.md) for new implementation work

Schema v4 retains all entities and constraints from schema v3. It adds one
canonical builder-profile reference to a submission:

```text
property_submissions (
  ...,
  property_id fk -> properties nullable,
  developer_id fk -> developers nullable,
  ...
)
```

For a new-property submission, `developer_id` identifies the administrator-
selected canonical builder profile before publication. It is distinct from the
evidence-backed `developer.name` contract field, which retains the source
wording but never resolves identity by itself. The application requires
`developer_id` before submission/publishing a new property.

`developers` remains the one live builder/company profile and may exist with no
account. `developer_users` is the future account-to-profile link for invited
builder staff; it never becomes a parallel developer entity.

## Submission update semantics

For an existing property, a submission is an additive patch. Omitted fields do
not delete or negate published data. A present `unit_variants` field upserts a
variant only by its exact reviewed `variant_name`; it never automatically
renames, fuzzy-matches, or deletes a variant. A new property receives explicit
`not_stated` rows for unmentioned controlled amenity/specification catalog
items; extracted facts become `available`.

Only the reviewed publish transaction applies these rules and writes a revision
snapshot. OCR adapters, seed scripts, migration scripts, and legacy comparison
code have no direct catalog-write path.
