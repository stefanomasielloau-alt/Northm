-- 2026-10-06: supports multiple auto-computed behavioral factors in Augur's Scoring model.
-- Stef: "Yes let me/anyone add more than one auto-computed behavioral factor."
--
-- Before this, computeBehavioralScore() was a single global function scored the same way for
-- every auto-computed factor -- adding a second one would just have duplicated the first with
-- no way to tell them apart. This column lets each auto-computed factor carry its OWN config:
-- which logged activity types feed it (Call/Email/Meeting, any subset) and its own decay window
-- in days. Fail-soft: Augur.html already runs fine without this column (every auto-computed
-- factor just falls back to the original all-three-types/60-day behaviour until it's run).
--
-- Safe to run multiple times (IF NOT EXISTS). Adds one column only -- no new table, no RLS
-- changes needed since it's a column on an existing, already-RLS-covered table.

ALTER TABLE public.augur_scoring_factors
  ADD COLUMN IF NOT EXISTS behavior_config jsonb;

-- Verify:
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='augur_scoring_factors' AND column_name='behavior_config';
