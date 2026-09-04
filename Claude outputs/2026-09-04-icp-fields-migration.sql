-- 2026-09-04: ICP fields -- revenue range & tech stack -- backlog item 14
-- Two new columns on prospectus_filters. Safe to run multiple times (IF NOT EXISTS guards).
-- Manual-entry only for now (Stef: "it can be either" -- starting with the simpler, no-new-cost
-- path). An enrichment provider can populate these same two columns later without a schema
-- change if that's ever preferred instead of/alongside manual entry.

ALTER TABLE prospectus_filters ADD COLUMN IF NOT EXISTS revenue_range TEXT NOT NULL DEFAULT '';
ALTER TABLE prospectus_filters ADD COLUMN IF NOT EXISTS tech_stack   TEXT NOT NULL DEFAULT '';

-- Prospectus.html already ships with fail-soft loading/saving for these two columns (its
-- 2026-09-04 comments) -- nothing breaks if this hasn't been run yet, the two new "Revenue
-- range" / "Tech stack" fields on the Filters table just show blank and won't persist until
-- it has.
