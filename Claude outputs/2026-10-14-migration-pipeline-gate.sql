-- 2026-10-14 -- which funnel stage counts as "pipeline" (for campaign expected pipeline).
-- Additive, safe to re-run. Until it is run, the app picks the first stage named like SQO / opportunity /
-- pipeline automatically, and the chooser in Strategy > Admin > Funnel gates explains it needs this file.
-- Rollback: 2026-10-14-migration-pipeline-gate-ROLLBACK.sql
ALTER TABLE public.org_settings ADD COLUMN IF NOT EXISTS pipeline_gate_id uuid;  -- a gates.id; if that gate is deleted the app falls back to automatic
NOTIFY pgrst, 'reload schema';
-- Check: SELECT org_id, pipeline_gate_id FROM org_settings;   (NULL = automatic)
