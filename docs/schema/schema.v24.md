# Schema v24 — released demand by intake BHK and city

**Date:** 2026-09-26. **Migration:** `0030_developer_intake_demand`. **Builds on:** [schema v23](schema.v23.md). **Decision:** `DECISIONS.md` 2026-09-26 "Intake demand on a developer's property". **Tasklist:** [Phase 4 portal completion](../tasklists/2026-09-26-phase-4-portal-completion.md).

The canonical `developer_analytics_released` table gains two allowed `dimension` values, `intake_bhk` and `intake_city`, for the existing `visitors` metric. Migration `0030` replaces only its dimension check constraint. No new table, personal identifier, catalog writer, role or grant is added. `rules_version` becomes `release-v3`; the job reruns all five fixed windows under this definition.

## Meaning and gate

For one listed property and report window, an identified visitor contributes to a BHK or city split when their own `intake_completed` event preceded a later direct property view or comparison containing that property. The job chooses the latest intake before the visitor's first qualifying property interaction in the window. It counts each visitor at most once per property and dimension; the intake may precede the window, while the property interaction must be inside it. A browser that sent a privacy signal has no visitor id and cannot be linked, so it contributes to neither split. The job joins BHK to the existing `bhk_types` catalog and normalises the stated city for grouping.

Each cell uses the existing **5 distinct identified visitors** gate and the no-subtraction rule for sibling cells. A withheld cell stores no number. The developer reader sees only the released table. The raw intake event, visitor/visit IDs and individual buyer answers remain inaccessible to developer code. These splits describe the stated demand of visitors who later engaged with this property; they are not a market-wide demand report or a statement that the property offers the chosen BHK or lies in the chosen city.

## Check constraint

`intake_bhk` accepts a controlled BHK key (`[a-z0-9_]`, at most 40 characters); the job joins `bhk_types`. `intake_city` accepts non-empty text of at most 60 characters with no control characters; the analytics event validator already constrains city input. Existing `none`, `device` and `budget_band` constraints remain. The migration is stamped after `0029` in the journal so an existing database will apply it.
